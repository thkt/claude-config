---
globs: ["**/scripts/**/*.py", "workflows/**/*.py"]
scenes: ["implement"]
---

# 供給の一覧は実行側の定数で持つ

## 内容

複数の箇所が同じキー集合やファイル一覧を必要とするとき、一方を docstring の一文やインライン辞書リテラル、あるいは既存の動的な算出手段と別に手で複製した定数として持つと、供給元が変わっても複製側は追従せず、要素が静かに抜け落ちる。一覧は実行側の名前付き定数として一箇所に持つか、既にそれを算出する関数がある場合はそこから実行時に導出し、手で書き写さない。

## 定型手順

1. 同じキー集合/ファイル一覧を複数箇所が必要とするか、あるいは既にそれを算出する関数が他にあるかを確認する
2. 一覧は実行側の名前付き定数として一箇所に持つか、既存の算出関数から実行時に導出する。docstring の散文やインライン辞書リテラルには委ねない
3. 別の箇所が同じ一覧を必要とするときは、その定数/関数を読んで検査する。期待値を手で書き写さない
4. テストは定数/関数の出力を読んで比較し、期待値をハードコードしない

## 参照コード

- `skills/ablate/scripts/enforcer_map.py` の `target_files`（`harness_elements.enumerate_elements` の always-loaded 絞り込みから実行時に導出し、手書きの定数を持たない）

## 根拠

- #557 `record.py` の stdout キー集合が docstring の一文とインラインな辞書リテラルのみに存在し、`build.js` 側は `RECORD_COUNT_TYPES` という名前付き定数から `RECORD_SCHEMA` を導出している非対称を指摘した
- #577 `enforcer_map.py` の `TARGET_FILES` が常時ロードファイル 8 件を手で複製した定数で、`harness_elements.enumerate_elements` が動的に返す 9 件目 (`rules/development/TOOLS.md`) を欠いていた。`target_files(root)` として実行時導出に置き換えた
