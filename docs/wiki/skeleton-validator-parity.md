---
globs: ["**/skills/**/templates/*.md", "**/skills/**/scripts/validate-*.py", "workflows/build.js"]
scenes: []
---

# 骨格は validator が要求するフィールドを載せる

## 内容

テンプレートや skeleton は、その出力を検査する validator が必須とするフィールドを漏れなく持つ。骨格から書き起こした成果物が validator で落ちるのは、骨格と validator が別々に育った結果になる。両者の対応をテストで固定する。

## 定型手順

1. validator が必須とするフィールドを列挙する
2. 骨格にそのフィールドが載っていることを確かめる
3. 骨格から書き起こした最小の成果物を validator へ通すテストを置く
4. validator の必須集合を変えるときは、骨格とテストを同じ変更単位で直す

## 参照コード

- `skills/issue/scripts/validate-issue-body.py` の `FLOOR`（型ごとに必須となる節。骨格が省いても足される）
- `skills/dr/scripts/validate-dr.py`（必須節と frontmatter を検査する）
- `workflows/build.js` の `REFERENCE_MODULE_LINE_RE`（骨格が節を省略しても、本文の `reference_module:` 行から kind/reason を正規表現で決定的に補うフォールバック）

## 根拠

- #330 plan skeleton に `reference_module` の path 行が無く build が停止した
- #338 その修正
- #356 reference module の files をパスのみへ揃えた
- #389 skill と workflow と rules を規約へ揃えた
- #535 テンプレートの指示どおり `### Reference module` 節を省いた plan が、旧形式のままの抽出 prompt に `reference_module` を拾われず Load 段で invalid-plan 停止した
- #570 その修正。抽出 prompt を kind/reason 形式に合わせ、`planSection` の該当行を正規表現で決定的に補うフォールバックを追加した
