---
globs: ["**/scripts/*.py"]
scenes: ["implement"]
---

# script/agent 出力は JSON stdout、error stderr、banner なしの機械可読形式にする

## 内容

skill や workflow から呼ぶ script の出力は、成功時は JSON 1 つを stdout へ、エラーは stderr へ分離する。banner や絵文字などの装飾は出力から外す。呼び出し側の LLM が結果を機械的にパースする前提であり、人間向けの整形はその判定を誤らせる。

## 定型手順

1. script の正常終了時の出力を JSON 1 つに定め、人間向けの説明文を混ぜない
2. エラーメッセージは stderr へ書き、exit code で成否を区別する
3. banner や絵文字、装飾的な区切り線を出力から外す
4. 呼び出し側 (skill の `allowed-tools`、agent の prompt) が JSON をそのままパースできることを確かめる

## 参照コード

- `skills/scribe/scripts/triage.py` (stdout に JSON、usage エラーは stderr へ書き exit 2)
- `skills/dr/scripts/validate-dr.py` (stdout に `{file, errors, warnings, checks}` の JSON)

## 根拠

- #13 `/adr` skill 刷新で script 出力を JSON on stdout, errors on stderr, no banners or emoji に統一した
- #54 `/assert` reviewer の verdict を JSON decision block に分離し、Markdown 散文を非権威化した
