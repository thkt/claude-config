#!/usr/bin/env python3
"""Usage: pr-body.py   (ship payload JSON on stdin)

build.js が既に保持している構造化データから、build workflow の draft-PR fact tail を
決定的に描画する。PR body は fail-closed な面であり、verify 結果を常に載せる。重い担保
(/audit、/polish review) は人間が起動する。tail が載せるのはその担保の
範囲までで、build が深いレビューを含まないことを tail_header が言う。読むのは build を
起動した本人なので、要るのは起動方法でなく範囲。agent は先頭の "## Summary"
(人間レビュアーの入口) だけを書き、この tail をその下に append する。

フォーマットは意図的に簡潔で markdown 構造。自動生成ブロックを示す 1 行ラベル、
Closes 行、そして status 行を <summary> に持つ折りたたみ <details> (markdown は
<summary> 内で描画されないため HTML <code>)。

畳むのは、PR body の入口が著者の書いた "## Summary" であり、機械生成の記録がその入口を
押し潰さないため。畳んだまま見える 3 つ (自動生成ラベル、Closes 行、status 行) は
「開く必要があるか」を判断するためだけに置くので、safety-critical な事実と非ゼロの
逸脱件数は status 行に載せる。

失敗ログ (入れ子の <details>) と情報的なリスト (assumptions、scope deviations、
missing test statements、anomalies) は非空のときだけ出すので、clean run では
セクションごとに「None」を繰り返さず短いままになる。<details> を作るのは畳む対象がある
run だけで、出すものが 1 つも無い run は status 行だけを置く。conformance / structure の finding は severity + category を
inline code の見出しに置き、location と出典行を継続行へ送る。1 行に詰めると severity が
埋もれ、どこまでが指摘でどこからが根拠か読み取れなくなる。anomaly は結論を親行に置き、
逐語のコマンド出力である根拠は入れ子の <details> へ畳む。太字はセクションラベル専用に
残すことで、セクションと finding の階層が視覚的に 1 段付く。

2 方向に fail-closed。parse できない payload、または safety-critical key
(tests_pass / gates_pass) を欠く payload は、それらしい「clean」body を出さず
stdout 空で exit 1 する。欠けた key は (呼び出し側の `&&` チェーンが PR を中止する
ことで) 表面化させ、安心させる値に default しない。

stdin:  JSON {issue, assumptions[], scope_deviations[], untouched_plan_files[],
              missing_tests[], code_anomalies[], tests_pass, gates_pass,
              verify_output, conformance[], structure[]}
stdout: markdown の fact tail。先頭は空行 + 水平線。
完了時は exit 0。parse error または必須 key の欠落時は exit 1。
"""

import json
import sys
from pathlib import Path

REQUIRED_KEYS = ("tests_pass", "gates_pass")

# body language ごとの人間向けラベル。翻訳するのは prose ラベルのみで、GitHub
# キーワード `Closes`、code-fence の status 行、`/issue` のようなコマンド名は auto-close
# と copy-paste が動くよう verbatim。未知の言語は英語に fallback する。tail を
# 決定的に保つため agent 提供でなくコード内に置く。
LABELS = {
    "english": {
        "tail_header": "_Below is the build workflow's automated verification. It checks the diff against the plan and does not hunt for code defects. It sits off the PR's main thread, so reading it is optional. Open it when a deviation count in the status line is non-zero._",
        "verify_output": "verify output",
        "evidence": "{n} evidence lines",
        "manual_checks": "Manual verification checklist (complete before merge)",
        "assumptions": "Assumptions (veto targets)",
        "scope_deviations": "Files outside the plan's scope",
        "untouched_plan_files": "Planned files never changed",
        "missing_tests": "Planned test statements not found",
        "conformance": "Issue conformance (review independently)",
        "structure": "Structural deviations from the reference module",
        "anomalies": "Anomalies (Red unconfirmed)",
    },
    "japanese": {
        "tail_header": "_下は build workflow の自動検証結果。plan との突合までで、コードの欠陥を探すレビューはしていない。PR の本筋からは外れるので任意だが、status 行の逸脱件数が非ゼロなら見る。_",
        "verify_output": "verify 出力",
        "evidence": "根拠 {n} 件",
        "manual_checks": "実機確認 (merge 前に実施)",
        "assumptions": "前提 (veto 対象)",
        "scope_deviations": "Plan スコープ外の変更ファイル",
        "untouched_plan_files": "一度も変更されていない plan の files",
        "missing_tests": "テストとして見つからない plan の言明",
        "conformance": "Issue 適合性 (独立レビュー)",
        "structure": "参照モジュールからの構造逸脱",
        "anomalies": "異常 (Red 未確認)",
    },
}


def _default_language():
    """dotclaude settings から得るユーザーの PR-body 言語。best-effort: 読み込み /
    parse の失敗は英語に fallback し、tail の描画は止めない。"""
    try:
        with open(Path.home() / ".claude" / "settings.json") as f:
            return json.load(f).get("language") or "english"
    except (OSError, json.JSONDecodeError):
        return "english"


def fail(message):
    print(f"Error: {message}", file=sys.stderr)
    sys.exit(1)


def _tag(f):
    """finding の見出し。severity を持つ finding は high と些細な指摘が一目で分かれる。"""
    severity = f.get("severity")
    category = f.get("category", "?")
    return f"[{severity}] {category}" if severity else f"[{category}]"


def _evidence(location, label, value):
    """finding の根拠を指す継続行。行頭は必ず backtick か語で始まり、インデントされた
    継続行が heading に昇格しない。どちらも無ければ ''。label は spec_line / reference
    のフィールド名に由来する識別子なので、LABELS に置かず英語のまま出す。"""
    parts = []
    if location:
        parts.append(f"`{location}`")
    if value:
        parts.append(f"{label}: {value}")
    return " · ".join(parts)


def _list(items):
    return items if isinstance(items, list) else []


def _fence(text):
    """text 中の最長 backtick 連より少なくとも 1 長い backtick fence。``` を含む
    内容でも code block が途中で終わらないようにする。"""
    longest = current = 0
    for ch in text:
        current = current + 1 if ch == "`" else 0
        longest = max(longest, current)
    return "`" * max(3, longest + 1)


def render(payload):
    issue = str(payload.get("issue", "")).strip()
    tests = "pass" if payload.get("tests_pass") else "FAIL"
    gates = "pass" if payload.get("gates_pass") else "FAIL"
    scope = _list(payload.get("scope_deviations"))
    untouched = _list(payload.get("untouched_plan_files"))
    missing = _list(payload.get("missing_tests"))
    conformance = _list(payload.get("conformance"))
    structure = _list(payload.get("structure"))
    lang = (payload.get("language") or "english").lower()
    L = LABELS.get(lang, LABELS["english"])

    out = [L["tail_header"], f"Closes #{issue}" if issue else "Closes #"]

    # status 行より下は全て 1 つの <details> に折りたたむ (レビュアーの要望: tail が
    # PR body を占拠しない)。status 行自体を <summary> にするので pass/FAIL は畳んだ
    # ままでも見える。markdown は <summary> 内で描画されないため backtick でなく
    # <code> を使う。
    summary = (
        f"<code>verify tests={tests} gates={gates}</code> · "
        f"<code>scope-deviations {len(scope)}</code> · "
        f"<code>missing-tests {len(missing)}</code>"
    )
    # 畳んだ状態で見えるのは summary だけなので、開くかどうかの判断に要る件数は
    # 0 件でなければここに出す。summary に無い件数は畳まれたまま気づかれない。
    # high の内訳を出すのは、件数だけでは表記の差と受け入れ条件を満たさない欠落が
    # 同じ 1 件に見えてしまうため。
    if untouched:
        summary += f" · <code>untouched-plan-files {len(untouched)}</code>"
    if conformance:
        high = sum(1 for f in conformance if isinstance(f, dict) and f.get("severity") == "high")
        summary += f" · <code>conformance {len(conformance)}"
        summary += f" ({high} high)</code>" if high else "</code>"
    if structure:
        summary += f" · <code>structure {len(structure)}</code>"
    folded = []

    if tests == "FAIL" or gates == "FAIL":
        detail = payload.get("verify_output")
        if detail:
            body = detail if isinstance(detail, str) else json.dumps(detail, indent=2)
            fence = _fence(body)
            folded.append(
                f"<details><summary>{L['verify_output']}</summary>\n\n{fence}\n{body}\n{fence}\n\n</details>"
            )

    def section(label, items, render_item, fold=None):
        items = _list(items)
        if not items:
            return
        lines = []
        for x in items:
            try:
                text = render_item(x)
            except (AttributeError, TypeError, KeyError):
                # malformed (例: non-dict) な item は render を crash させて fail-closed
                # tail 全体を落としてはならない。代わりに raw string に degrade する。
                text = str(x)
            # render_item が list を返したら 2 要素目以降を継続行にする。各要素は 1 行に
            # 保ち、埋め込まれた改行が list を壊したり次行を heading に昇格させたりしない
            # ようにする。
            parts = text if isinstance(text, list) else [text]
            parts = [" ".join(str(p).split("\n")) for p in parts if str(p).strip()]
            if not parts:
                continue
            lines.append("- " + parts[0])
            if fold and len(parts) > 1:
                # インデント 2 が list item 内に収め、前後の空行が中の markdown を描画させる。
                lines.append(f"  <details><summary>{fold.format(n=len(parts) - 1)}</summary>")
                lines.append("")
                lines.extend("  - " + p for p in parts[1:])
                lines.append("")
                lines.append("  </details>")
            else:
                lines.extend("  " + p for p in parts[1:])
        folded.append(f"**{label}**\n" + "\n".join(lines))

    # レビュアーが PR 上でチェックを付けられるよう task-list item として描画する。
    section(L["manual_checks"], payload.get("manual_checks"), lambda s: f"[ ] {s}")
    section(L["assumptions"], payload.get("assumptions"), str)
    section(L["scope_deviations"], scope, lambda f: f"`{f}`")
    # scope_deviations の逆向き。plan が挙げたのに触られていないファイルは、unit が
    # 丸ごと実装されないまま通った跡であることがある。
    section(L["untouched_plan_files"], untouched, lambda f: f"`{f}`")
    section(L["missing_tests"], missing, str)
    section(
        L["conformance"],
        conformance,
        lambda f: [
            f"`{_tag(f)}` {f.get('detail', '')}".rstrip(),
            _evidence(f.get("location"), "spec", f.get("spec_line")),
        ],
    )
    section(
        L["structure"],
        structure,
        lambda f: [
            f"`{_tag(f)}` {f.get('detail', '')}".rstrip(),
            _evidence(f.get("location"), "ref", f.get("reference")),
        ],
    )
    # 根拠は逐語のコマンド出力で、行数が結論を押し潰す。逐語であることが証跡の価値なので
    # 翻訳では縮まず、短くできるのは描画側だけ。
    section(
        L["anomalies"],
        payload.get("code_anomalies"),
        lambda a: [
            f"{a.get('unit', '?')} ({a.get('kind', '?')}): {a.get('notes', '')}".rstrip(),
            *(str(e) for e in _list(a.get("evidence"))),
        ],
        fold=L["evidence"],
    )

    # 折りたたみ内容の前後に空行を置くことで、GitHub は HTML <details> ブロック内の
    # markdown を描画し続ける。<details> を作るのは畳む対象がある run だけ。開いても
    # 空の <details> は、レビュアーに中身の無いものを開かせる。
    out.append(
        f"<details>\n<summary>{summary}</summary>\n\n" + "\n\n".join(folded) + "\n\n</details>"
        if folded
        else summary
    )

    # 空行 + 水平線で始め、agent の Summary の下に append (>>) したときこの machine tail
    # が分離を保ち、summary の最終行を setext heading に変えず、自動生成セクションの
    # 開始を示す。
    return "\n\n---\n\n" + "\n\n".join(out) + "\n"


def main():
    try:
        payload = json.loads(sys.stdin.read())
    except json.JSONDecodeError as exc:
        fail(f"ship payload is not valid JSON: {exc}")
    if not isinstance(payload, dict):
        fail("ship payload must be a JSON object")
    missing = [k for k in REQUIRED_KEYS if k not in payload]
    if missing:
        fail(f"ship payload missing required key(s): {', '.join(missing)}")
    payload.setdefault("language", _default_language())
    sys.stdout.write(render(payload))


if __name__ == "__main__":
    main()
