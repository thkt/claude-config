---
globs: ["**/workflows/**/*.js"]
scenes: ["implement"]
---

# workflow script は import/export で値を共有できず、定数一致はソーステキスト比較テストでのみ担保する

## 内容

workflow script は `export const meta` の 1 箇所しか import/export を使えず、2 つ目以降の `export` は SyntaxError になる。複数の workflow script が同じ定数 (severity のランク、implementer の許容値など) を共有する必要があっても、モジュールとして共有できない。各ファイルが同じ値を独立して持ち、一致はハードコードした期待値ではなく、両ファイルのソーステキストから定数を抽出して比較するテストで担保する。

## 定型手順

1. 複数の workflow script が同じ定数を持つ必要があるかを確認する
2. import/export では共有できないため、各ファイルにその定数を独立して定義する
3. テストは期待値を書き写さず、`readFileSync` で両ファイルのソースを読み、定数を抽出して比較する
4. 抽出した定数が空でないことも合わせて確認し、抽出自体の失敗を「一致」と誤検出しない

## 参照コード

- `workflows/_lib/run-workflow.js` の `checkWorkflowSyntax`(`^export const meta` 以外の `export` を SyntaxError にする実装)
- `workflows/audit/tests/audit.routing.test.js` の `parseNumericConst`(`audit.js` と `assert.js` のソースから `SEVERITY_RANK` を抽出し比較する)

## 根拠

- #548 `audit.js` と `assert.js` の `SEVERITY_RANK` をソーステキストから抽出して比較する T-105 を追加した
- #481 build と code の meta 整理で、workflow script が import/export できず `export const meta` の 1 箇所しか剥がされないため、定数はテスト側からソーステキストで読む前提を明記した
- #367 `implementer` の定数をテスト側からソーステキストで読む前提を、`workflows/_lib/run-workflow.js:166` の実測 (2 つ目以降の `export` は SyntaxError になる) とともに明記した
