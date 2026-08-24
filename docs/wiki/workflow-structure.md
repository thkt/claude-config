---
globs: ["**/workflows/**/*.js"]
kind: structure
---

# workflow の構造と起動契約

## 内容

workflow は `adrift` `assert` `audit` `build` `code` `polish` `shake` の 7 本で、すべて `args.repo` を必須とし、欠けた起動は本体に入る前に `stopped: "no-repo"` を返して止まる。

## 境界

- 7 本は独立して起動する。入れ子は 2 経路だけで、`assert.js` が `workflow("audit")` を呼び、`build.js` が `workflow("code")` を呼ぶ
- script は agent を呼ぶ側で、git 操作もファイル読み書きも agent に渡す。script 自身が持つのは制御フローと判定だけ
- `workflows/_lib/run-workflow.js` はテスト用の実行器で、本番サンドボックスの供給を写している。両者の食い違いをどう扱うかは `harness-production-divergence.md` が持つ

## 契約

| 対象 | 契約 |
| --- | --- |
| `args.repo` | 7 本すべてで必須。省略した起動は `stopped: "no-repo"` で止まる |
| 起動前の停止 | `{ stopped: "<理由>" }` を返す形に揃える。`build` だけ `no-repo` と `no-plan` の 2 つを持つ |
| `meta` | ファイル先頭の `export const meta`。script は ESM でも CommonJS でもなく、注入されたグローバルを引数に取る関数本体として実行される |
| 入れ子の引数 | 親が `repo` を明示的に渡す。`assert` は `skipPreflight: true` も添えて二重実行を防ぐ |

## 要求

| 対象 | 上限 | 超えたときの挙動 |
| --- | --- | --- |
| `build` の unit | files 3 / tests 4 (seam unit を除く) | 分割をやり直させる |
| `shake` の修正 | 再試行 3 回 | 打ち切って confirmed-flaky のまま返す |

## 参照コード

- `workflows/build.js` の `UNIT_CAPS` (unit の大きさの上限を script が持つ)
- `workflows/shake.js` の `MAX_FIX_ATTEMPTS` (修正の再試行回数)
- `workflows/build.js` の `stop` (起動前の停止を返す共通経路)
- `workflows/_lib/run-workflow.js` の `checkWorkflowSyntax` (script が関数本体として構文検査される形)

## 由来

- `docs/decisions/0105-require-argsrepo-in-every-workflow.md` (7 本すべてで `args.repo` を必須にした)
- `docs/decisions/0087-enforce-unit-size-caps-with-regeneration-in-build.md` (unit の上限と再生成)
- `docs/decisions/0081-move-machinery-fan-out-from-skill-prose-to-deterministic-workflow.md` (fan-out を skill の散文から script へ移した)
