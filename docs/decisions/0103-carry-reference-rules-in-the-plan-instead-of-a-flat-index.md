---
status: "accepted"
date: "2026-08-20"
decision-makers: "thkt"
---

# Carry reference rules in the plan instead of a flat index

## Context and Problem Statement

DR-0091 は、実装 agent へリファレンスを届ける機構としてフラットインデックス (`docs/REFERENCE_INDEX.md`) と glob 照合を採った。`workflows/code.js` が実行時にインデックスを読み、`units[].files` と照合して読了命令を prompt へ注入する。索引の保守は `/stock` が担う。

この構成には、届いたかどうかが実行時にしか分からないという性質がある。issue を読んだ人間には、実装 agent が何を読むよう指示されたかが見えない。加えて、決まりごとを書く側 (`/scribe` が作る `docs/wiki/`) と索引が別ファイルで、同じ glob を二重に持つ。

DR-0091 の Reassessment Triggers のうち「インデックスと実配置の glob がずれ、注入漏れが実際に起きたとき」は #283 で一度発火している。index の glob が EN パスしか指さず `.ja/` 始まりのパスに 1 行も一致しない状態と、Edit ツールで触ると formatter が `*` をエスケープして全行が対応外になる破壊の 2 つが同時に見つかった。機構の中で直したが、DR は再検討していない。

## Decision Outcome

決まりごとを plan が運ぶ。`/think` が `docs/wiki/` から該当ページを引き、逐語の引用を plan の `### 決まりごと` 節へ書く。`/issue` がその節ごと issue の `## Plan` へ移し、build の extract が `PLAN_SCHEMA` の `rules` へ取り込み、`workflows/code.js` が実装 prompt へそのまま流す。実装の時点で何も引きに行かない。

該当ページの特定は `skills/scribe/scripts/find_wiki_rule.py` が担う。ページの frontmatter が持つ `globs` を `units[].files` と照合する決定論の部分と、ファイル名の語の重なりで候補を出す近似の部分を分けて返す。

`docs/REFERENCE_INDEX.md` と `/stock` を廃止する。索引という中間物が無くなり、決まりごとの置き場は `docs/wiki/` の 1 箇所になる。

### Consequences

- issue を読めば、実装 agent へ何が届くかが読める。届いたかどうかが実行時のログでなく plan の記述で決まる
- 決まりごとが実装へ届くかは `/think` がページを引けたかに依存する。索引という決定論の backstop は無くなり、決定論は finder の glob 照合へ移る
- glob の真実がページの frontmatter の 1 箇所になる。索引との二重管理が消える
- `/fix` は plan を持たないので、決まりごとを自分で引く。`skills/fix/SKILL.md` の 決まりごとの参照 節が、修正するファイルが定まった時点で同じ finder を 1 回だけ叩く。plan が運ぶ経路と、その場で引く経路の 2 つになる

### Confirmation

- `workflows/code/tests/code.rules.test.js` が、plan の `rules` が実装 prompt へ届くこと、Red step には届かないこと、リファレンス文書を読む agent が 1 体も起動しないことを検査する
- `skills/scribe/tests/find_wiki_rule_test.py` が、このリポジトリの全ページの glob が `git ls-files` の少なくとも 1 ファイルに一致することを検査する
- `skills/think/tests/plan-draft.test.js` が、Phase 2 と Phase 3 の両方で finder が走ること、`matched` の各ページの行き先が定まっていることを検査する

### Reassessment Triggers

- `/think` がページを引けず、決まりごとが実装へ届かなかった実例が出たとき
- 決まりごとの数が増え、plan の `### 決まりごと` 節が 1 画面に収まらなくなったとき

## Considered Options

- DR-0091 の索引を維持し、ページの frontmatter から索引を生成する。`code.js` は索引だけを読む形が保たれるが、中間物と生成の手順が残る
- `code.js` が `docs/**` の frontmatter を走査する。DR-0091 の「docs 全体は走査対象にならない」と正面から衝突し、走査コストも対象リポジトリの規模に比例する

Supersedes DR-0091.
