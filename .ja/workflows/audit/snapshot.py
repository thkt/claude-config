"""Usage: snapshot.py   (audit payload JSON on stdin)

audit の 1 実行を $HOME/.claude/history/ に記録し、直近の prior snapshot に
対する resolved/new/carried の delta を計算する。

stdin:  JSON {scope, focus, pre_flight, raw_findings[], findings[], skipped[],
        challenge_ran, verify_ran, tally, needs_context[], zero_reviewer_files[]}
        各 raw_findings entry は最低限 {file, message} を持ち、triage を通った後は
        {id, reviewer, verdict} も持つ。
        キーは record にそのまま写す。無いキーは無いまま。tally が無い run は
        fail-open したことを意味し、それは challenge_ran / verify_ran が直接示す。
stdout: {path, counts} の JSON 1 行。counts はこのプロセスが serialize した各配列の
        要素数なので、呼び出し元は payload を書き写した agent 由来でない数字と
        照合できる。
exit 0 は成功。exit 1 は payload が parse 不能 (何も書かない)。

record に追加される解決済みフィールド (シェル / prior snapshot 由来):
  branch        git rev-parse --abbrev-ref HEAD ("unknown" にフォールバック)
  generated_at  UTC ISO-8601
  delta         直近の audit-*.json に対する {resolved, new, carried} カウント。
                (file, message) で照合。初回は全て 0 + note "first run"。
"""

import glob
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import NoReturn

HISTORY_DIR = Path(os.path.expanduser("~")) / ".claude" / "history"


def fail(message) -> NoReturn:
    print(f"Error: {message}", file=sys.stderr)
    sys.exit(1)


def finding_key(f):
    return (f.get("file"), f.get("message"))


def compute_delta(current_raw, prior_raw):
    """resolved = prior のみ、new = current のみ、carried = 両方に存在。

    prior snapshot が無いとき prior_raw は None。その場合は "first run" note を
    記録する。
    """
    if prior_raw is None:
        return {"resolved": 0, "new": 0, "carried": 0, "note": "first run"}
    cur = {finding_key(f) for f in current_raw}
    prior = {finding_key(f) for f in prior_raw}
    return {
        "resolved": len(prior - cur),
        "new": len(cur - prior),
        "carried": len(cur & prior),
    }


def contradicts_own_tally(data):
    """record の raw_findings が自身の tally より少ないとき True。

    raw_findings は survived + needs_context + disputed なので、tally を持つ
    record では len(raw_findings) >= survived + needs_context が成り立つ。これを
    満たさない record は tally を計算した後に要素を失っている。payload は LLM の
    prompt を経由して書き手に届くため、書き写す途中で要約されると件数はそのまま
    に配列だけが痩せる。tally を持たない record は照合する相手が無いので対象外。
    """
    tally = data.get("tally")
    raw = data.get("raw_findings")
    if not isinstance(tally, dict) or not isinstance(raw, list):
        return False
    survived = tally.get("survived", 0)
    needs_context = tally.get("needs_context", 0)
    # 加算する前に両オペランドの型を見る。prior の tally が "survived": "21" だと
    # 加算が TypeError を投げ、latest_prior_raw が拾うのは OSError と ValueError
    # だけなので main() ごと落ちて record が 1 つも書かれない。この関数がまたぐ
    # べき壊れた prior で、まさにそれが起きる。
    if not isinstance(survived, int) or not isinstance(needs_context, int):
        return False
    return len(raw) < survived + needs_context


def latest_prior_raw(history_dir):
    """baseline に使える直近の prior audit-*.json の raw_findings。無ければ None。

    ファイル名でソートする。名前に UTC timestamp が入るため辞書順が時系列に
    なる。読めない、raw_findings を欠く、自身の tally と矛盾する prior ファイルは
    run を中断せずスキップする。痩せた record を baseline に取ると、失われた
    要素が次の run で new、その次の run で resolved と報告され、delta が 2 回
    続けて狂う。
    """
    priors = sorted(glob.glob(str(history_dir / "audit-*.json")), reverse=True)
    for path in priors:
        try:
            with open(path) as fh:
                data = json.load(fh)
        except (OSError, ValueError):
            continue
        if contradicts_own_tally(data):
            continue
        raw = data.get("raw_findings")
        if isinstance(raw, list):
            return raw
    return None


def git_branch():
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        branch = out.stdout.strip()
        return branch or "unknown"
    except (OSError, subprocess.SubprocessError):
        return "unknown"


COUNTED_ARRAYS = (
    "raw_findings",
    "findings",
    "skipped",
    "needs_context",
    "zero_reviewer_files",
)


def counted_arrays(record):
    """record が持つ配列ごとの要素数。呼び出し元はこれと照合する。

    無いキーは省かず 0 と数える。呼び出し元が毎回同じキー集合を読めるので、
    配列が丸ごと落ちた場合もフィールドの欠落でなく件数の不一致として出る。
    """
    return {
        key: len(record[key]) if isinstance(record.get(key), list) else 0
        for key in COUNTED_ARRAYS
    }


def build_record(payload, branch, generated_at, delta):
    record = dict(payload)
    record["branch"] = branch
    record["generated_at"] = generated_at
    record["delta"] = delta
    return record


def main():
    raw_stdin = sys.stdin.read()
    try:
        payload = json.loads(raw_stdin)
    except ValueError as exc:
        fail(f"unparseable payload: {exc}")
    if not isinstance(payload, dict):
        fail("payload must be a JSON object")

    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)

    prior_raw = latest_prior_raw(HISTORY_DIR)
    current_raw = payload.get("raw_findings") or []
    delta = compute_delta(current_raw, prior_raw)

    record = build_record(
        payload,
        branch=git_branch(),
        generated_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        delta=delta,
    )

    out_path = HISTORY_DIR / f"audit-{now.strftime('%Y-%m-%d-%H%M%S')}.json"
    with open(out_path, "w") as fh:
        json.dump(record, fh, ensure_ascii=False, indent=2)
    # counts はこのプロセスが serialize した内容から取る。呼び出し元は agent が
    # 自分について報告した数字ではなく、この値と照合する。
    print(json.dumps({"path": str(out_path), "counts": counted_arrays(record)}))


if __name__ == "__main__":
    main()
