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

失敗ログ (入れ子の <details>) と情報的なリスト (scope deviations、
missing test statements、anomalies) は非空のときだけ出すので、clean run では
セクションごとに「None」を繰り返さず短いままになる。<details> を作るのは畳む対象がある
run だけで、出すものが 1 つも無い run は status 行だけを置く。
conformance / structure の finding は severity + category を
inline code の見出しに置き、location と出典行を継続行へ送る。1 行に詰めると severity が
埋もれ、どこまでが指摘でどこからが根拠か読み取れなくなる。anomaly は結論を親行に置き、
逐語のコマンド出力である根拠は入れ子の <details> へ畳む。太字はセクションラベル専用に
残すことで、セクションと finding の階層が視覚的に 1 段付く。

2 方向に fail-closed。parse できない payload、または safety-critical key
(tests_pass / gates_pass) を欠く payload は、それらしい「clean」body を出さず
stdout 空で exit 1 する。欠けた key は (呼び出し側の `&&` チェーンが PR を中止する
ことで) 表面化させ、安心させる値に default しない。

stdin:  JSON {issue, scope_deviations[], untouched_plan_files[],
              missing_tests[], code_anomalies[], tests_pass, gates_pass,
              verify_output, conformance[], structure[]}
stdout: markdown の fact tail。先頭は空行 + 水平線。
完了時は exit 0。parse error または必須 key の欠落時は exit 1。
"""

import json
import sys
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import NoReturn, cast

REQUIRED_KEYS = ("tests_pass", "gates_pass")

# 走らなかったチェックと何も見つからなかったチェックはどちらも 0 件なので、status 行で両者を
# 分けるのは status だけになる。no-tests と no-reference は検査対象が無かったという意味で、
# それは 0 が既に言っている。
NOT_RUN = ("agent-failed", "no-spec")

# 翻訳するのは prose ラベルのみで、GitHub キーワード `Closes`、code-fence の status 行、
# `/issue` のようなコマンド名は auto-close と copy-paste が動くよう verbatim。tail を
# 決定的に保つため agent 提供でなくコード内に置く。
LABELS = {
    "english": {
        "tail_header": "_Below is the build workflow's automated verification. It checks the diff against the plan and does not hunt for code defects. It sits off the PR's main thread, so reading it is optional. Open it when a deviation count in the status line is non-zero._",
        "not_run": "not run",
        "verify_output": "verify output",
        "evidence": "{n} evidence lines",
        "manual_checks": "Manual verification checklist (complete before merge)",
        "scope_deviations": "Files outside the plan's scope",
        "untouched_plan_files": "Planned files never changed",
        "missing_tests": "Planned test statements not found",
        "conformance": "Issue conformance (review independently)",
        "structure": "Structural deviations from the reference module",
        "anomalies": "Anomalies (Red unconfirmed)",
    },
    "japanese": {
        "tail_header": "_下は build workflow の自動検証結果。plan との突合までで、コードの欠陥を探すレビューはしていない。PR の本筋からは外れるので任意だが、status 行の逸脱件数が非ゼロなら見る。_",
        "not_run": "未実行",
        "verify_output": "verify 出力",
        "evidence": "根拠 {n} 件",
        "manual_checks": "実機確認 (merge 前に実施)",
        "scope_deviations": "Plan スコープ外の変更ファイル",
        "untouched_plan_files": "一度も変更されていない plan の files",
        "missing_tests": "テストとして見つからない plan の言明",
        "conformance": "Issue 適合性 (独立レビュー)",
        "structure": "参照モジュールからの構造逸脱",
        "anomalies": "異常 (Red 未確認)",
    },
}


def _mapping(value: object) -> dict[str, object]:
    """value を文字列キーの mapping として読む。mapping でない値は空の dict にする。"""
    return cast("dict[str, object]", value) if isinstance(value, dict) else {}


def _default_language() -> str:
    """読み込み / parse の失敗は英語に fallback し、tail の描画を止めない。"""
    try:
        with (Path.home() / ".claude" / "settings.json").open() as f:
            settings = _mapping(cast("object", json.load(f)))
    except (OSError, json.JSONDecodeError):
        return "english"
    language = settings.get("language")
    return language if isinstance(language, str) and language else "english"


def fail(message: str) -> NoReturn:
    print(f"Error: {message}", file=sys.stderr)
    sys.exit(1)


def _tag(f: dict[str, object]) -> str:
    """severity を持つ finding は、high と些細な指摘が一目で分かれる。"""
    severity = f.get("severity")
    category = f.get("category", "?")
    return f"[{severity}] {category}" if severity else f"[{category}]"


def _evidence(location: object, label: str, value: object) -> str:
    """行頭は必ず backtick か語で始まり、インデントされた継続行が heading に昇格しない。
    label は spec_line / reference のフィールド名に由来する識別子なので、LABELS に置かず
    英語のまま出す。"""
    parts: list[str] = []
    if location:
        parts.append(f"`{location}`")
    if value:
        parts.append(f"{label}: {value}")
    return " · ".join(parts)


def _list(items: object) -> list[object]:
    return cast("list[object]", items) if isinstance(items, list) else []


def _fence(text: str) -> str:
    """``` を含む内容でも code block が途中で終わらないようにする。"""
    longest = current = 0
    for ch in text:
        current = current + 1 if ch == "`" else 0
        longest = max(longest, current)
    return "`" * max(3, longest + 1)


def _finding(f: object, label: str, source_key: str) -> list[str]:
    """非 mapping では送出し、section の degrade 経路へ回して raw string に落とさせる。"""
    if not isinstance(f, dict):
        raise TypeError("finding is not a mapping")
    d = cast("dict[str, object]", f)
    return [
        f"`{_tag(d)}` {d.get('detail', '')}".rstrip(),
        _evidence(d.get("location"), label, d.get(source_key)),
    ]


def _anomaly(a: object) -> list[str]:
    """非 mapping では送出し、section の degrade 経路へ回して raw string に落とさせる。"""
    if not isinstance(a, dict):
        raise TypeError("anomaly is not a mapping")
    d = cast("dict[str, object]", a)
    return [
        f"{d.get('unit', '?')} ({d.get('kind', '?')}): {d.get('notes', '')}".rstrip(),
        *(str(e) for e in _list(d.get("evidence"))),
    ]


def render(payload: Mapping[str, object]) -> str:
    issue = str(payload.get("issue", "")).strip()
    tests = "pass" if payload.get("tests_pass") else "FAIL"
    gates = "pass" if payload.get("gates_pass") else "FAIL"
    scope = _list(payload.get("scope_deviations"))
    untouched = _list(payload.get("untouched_plan_files"))
    missing = _list(payload.get("missing_tests"))
    conformance = _list(payload.get("conformance"))
    structure = _list(payload.get("structure"))
    raw_lang = payload.get("language")
    lang = raw_lang.lower() if isinstance(raw_lang, str) and raw_lang else "english"
    L = LABELS.get(lang, LABELS["english"])

    out = [L["tail_header"], f"Closes #{issue}" if issue else "Closes #"]

    # status 行自体を <summary> にするので pass/FAIL は畳んだままでも見える。markdown は
    # <summary> 内で描画されないため backtick でなく <code> を使う。
    def cell(label: str, key: str, count: int, always: bool, suffix: str = "") -> str:
        """チェックが走ったら件数、走らなかったら "not run"、出すものが無ければ ""。status キーを
        持たない payload はそれ以前の呼び出し元から来たものなので、件数をそのまま信じる。"""
        status = payload.get(f"{key}_status")
        if isinstance(status, str) and status in NOT_RUN:
            return f"<code>{label} {L['not_run']}</code>"
        return f"<code>{label} {count}{suffix}</code>" if always or count else ""

    high = sum(1 for f in conformance if _mapping(f).get("severity") == "high")
    cells = [
        f"<code>verify tests={tests} gates={gates}</code>",
        cell("scope-deviations", "scope", len(scope), True),
        cell("missing-tests", "test_presence", len(missing), True),
    ]
    # summary に無い件数は畳まれたまま気づかれないので、開くかどうかの判断に要る件数は
    # 0 件でなければここに出す。high の内訳を出すのは、件数だけでは表記の差と、受け入れ
    # 条件を満たさない欠落が同じ 1 件に見えるため。
    if untouched:
        cells.append(f"<code>untouched-plan-files {len(untouched)}</code>")
    cells.append(
        cell(
            "conformance", "conformance", len(conformance), False, f" ({high} high)" if high else ""
        )
    )
    cells.append(cell("structure", "structure", len(structure), False))
    summary = " · ".join(c for c in cells if c)
    folded: list[str] = []

    if tests == "FAIL" or gates == "FAIL":
        detail = payload.get("verify_output")
        if detail:
            body = detail if isinstance(detail, str) else json.dumps(detail, indent=2)
            fence = _fence(body)
            folded.append(
                f"<details><summary>{L['verify_output']}</summary>\n\n{fence}\n{body}\n{fence}\n\n</details>"
            )

    def section(
        label: str,
        items: object,
        render_item: Callable[[object], str | list[str]],
        fold: str | None = None,
    ) -> None:
        items = _list(items)
        if not items:
            return
        lines: list[str] = []
        for x in items:
            try:
                text = render_item(x)
            except (AttributeError, TypeError, KeyError):
                # malformed (例: non-dict) な item は render を crash させて fail-closed
                # tail 全体を落としてはならない。
                text = str(x)
            # 埋め込まれた改行が list を壊し次行を heading に昇格させるので、各要素は
            # 1 行に保つ。
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
    section(L["scope_deviations"], scope, lambda f: f"`{f}`")
    # scope_deviations の逆向き。plan が挙げたのに触られていないファイルは、unit が
    # 丸ごと実装されないまま通った跡であることがある。
    section(L["untouched_plan_files"], untouched, lambda f: f"`{f}`")
    section(L["missing_tests"], missing, str)
    section(L["conformance"], conformance, lambda f: _finding(f, "spec", "spec_line"))
    section(L["structure"], structure, lambda f: _finding(f, "ref", "reference"))
    # 根拠は逐語のコマンド出力で行数が結論を押し潰すが、逐語であることが証跡の価値なので、
    # 短くできるのは描画側だけ。
    section(L["anomalies"], payload.get("code_anomalies"), _anomaly, fold=L["evidence"])

    # 折りたたみ内容の前後の空行が、GitHub に HTML <details> 内の markdown を描画させる。
    # 空の <details> は、レビュアーに中身の無いものを開かせる。
    out.append(
        f"<details>\n<summary>{summary}</summary>\n\n" + "\n\n".join(folded) + "\n\n</details>"
        if folded
        else summary
    )

    # 空行 + 水平線が、agent の Summary の下に append (>>) したときこの machine tail の
    # 分離を保ち、summary の最終行を setext heading に変えない。
    return "\n\n---\n\n" + "\n\n".join(out) + "\n"


def main() -> None:
    try:
        loaded = cast("object", json.loads(sys.stdin.read()))
    except json.JSONDecodeError as exc:
        fail(f"ship payload is not valid JSON: {exc}")
    if not isinstance(loaded, dict):
        fail("ship payload must be a JSON object")
    payload = cast("dict[str, object]", loaded)
    missing = [k for k in REQUIRED_KEYS if k not in payload]
    if missing:
        fail(f"ship payload missing required key(s): {', '.join(missing)}")
    _ = payload.setdefault("language", _default_language())
    _ = sys.stdout.write(render(payload))


if __name__ == "__main__":
    main()
