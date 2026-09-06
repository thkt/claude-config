---
globs: ["**/workflows/**/*.js"]
scenes: []
kind: structure
---

# workflow の構造と起動契約

## 内容

workflow は `adrift` `assert` `audit` `build` `code` `polish` `shake` の 7 本で、いずれも agent を呼ぶ script として走る。

## 境界

- 7 本は独立して起動する。入れ子は 2 経路だけで、`assert.js` が audit を、`build.js` が code を呼ぶ
- 入れ子の呼び方は 2 経路で揃っていない。`build.js` は `sibling` を通し、bare 名が解決できなければ `build:` 名前空間へ落とす。`assert.js` は `workflow("audit")` を直に呼ぶ
- script が持つのは制御フローと判定だけで、git 操作もファイル読み書きも agent に渡す
- `workflows/_lib/run-workflow.ts` はテスト用の実行器で、本番サンドボックスの供給を写している。両者の食い違いの扱いは `harness-production-divergence.md` が持つ

## 契約

| 対象 | 契約 |
| --- | --- |
| `args.repo` | 7 本すべてで必須。省略した起動は本体に入る前に `stopped: "no-repo"` で止まる |
| 起動前の停止 | `{ stopped: "<理由>", why }` を返す。`why` には呼び出し側が次に取る操作を書く。理由の語彙は workflow ごとに持つ |
| `meta` と実行の形 | ファイル先頭の `export const meta`。本体は注入されたグローバルを引数に取る関数本体として走り、トップレベルの `return` が返り値になる |
| 入れ子の引数 | 親が `repo` を明示的に渡す。`assert` は `skipPreflight: true` を、`build` は `model` と `commit` を添える |

## 要求

| 対象 | 上限 | 超えたときの挙動 |
| --- | --- | --- |
| `build` の unit | files 3 / tests 4 (seam unit を除く) | 分割をやり直させる |
| `shake` の修正 | 再試行 3 回 | `blocker` として返す。テストを弱めない |

## 参照コード

- `workflows/build.js` の `UNIT_CAPS`
- `workflows/shake.js` の `MAX_FIX_ATTEMPTS`
- `workflows/build.js` の `stop`
- `workflows/build.js` の `sibling` (入れ子の名前解決を plugin 名前空間へ落とす)
- `workflows/build.js` の `PLAN_QUALITY` (停止理由ごとに、計画の質の問題かを持つ)
- `workflows/_lib/run-workflow.ts` の `checkWorkflowSyntax`

## 由来

- `docs/decisions/0105-require-argsrepo-in-every-workflow.md`
- `docs/decisions/0087-enforce-unit-size-caps-with-regeneration-in-build.md`
- `docs/decisions/0081-move-machinery-fan-out-from-skill-prose-to-deterministic-workflow.md`
