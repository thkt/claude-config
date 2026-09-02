---
status: "accepted"
date: "2026-09-02"
decision-makers: "thkt"
---

# Adopt two-tier path for agent bundled assets

## Context and Problem Statement

agent 本文が同梱資産 (`agents/_lib/finding-schema.md`、`agents/_lib/calibration-examples.md`、`rules/`、`workflows/audit/snapshot.py`) を `~/.claude/...` で参照していた。`rules/conventions/SKILLS.md` は同じ形を「dev tree を指し、plugin install は別コピーを読む」として禁じ、`rules/conventions/WORKFLOWS.md` は dev tree と plugin の両方で解決する形を要求している。agent だけが例外で、その理由はどこにも書かれていなかった。

例外の原因は変数の不在にある。skill 本文の `${CLAUDE_SKILL_DIR}` は dev tree でも plugin でも展開されるが、agent 本文には定義されていない。`${CLAUDE_PLUGIN_ROOT}` は agent 本文で展開されるが、plugin install のときだけで、dev tree では文字のまま残る (Claude Code plugins-reference § Environment variables)。agent に両環境で解決する記法が無い状態で、どう書けば plugin でも dev tree でも同じ資産に届くか。

## Decision Drivers

- `.claude/OUTCOME.md` の Non-goals は他メンバーへの配布を対象外としており、このマシンに dotclaude の plugin は install されていない。dev tree で今日動くことを落とせない
- DR-0083 は build plugin を維持している。plugin 起動で壊れる形は採れない
- 解決失敗は実行時に報告されない。Read が失敗した agent は資産なしで走り、finding の形式だけが崩れる

## Considered Options

- 二段パス。`${CLAUDE_PLUGIN_ROOT}/...` で書き、変数が未展開なら `~/.claude/` 配下の同じパスを読む代替文を agent ごとに 1 文置く
- `skills:` frontmatter で preload。`_lib` を skill 化し、agent は本文注入で受け取る
- `${CLAUDE_PLUGIN_ROOT}` 単独。dev tree では解決しない
- `~/.claude/` のまま、SUBAGENT.md に例外の理由だけ書く

## Decision Outcome

Chosen option: 二段パス。`${CLAUDE_PLUGIN_ROOT}` は plugin で展開され、dev tree では文字のまま残るので、agent は `${` で始まるかどうかで環境を判別できる。WORKFLOWS.md の `bundled(rel)` が script ごとに定義を重複させるのと同じ形を prose に置いた。

代替文は `rules/conventions/SUBAGENT.md` § Reference notation が文言を定め、`tests/live-instructions.test.js` が全 agent で逐語一致を検査する。

### Consequences

- Good, because 同じ agent 定義が dev tree でも plugin install でも同じ資産を読む
- Good, because SUBAGENT.md、SKILLS.md、WORKFLOWS.md の 3 規約が「dev tree と plugin の両方で解決する」で揃う
- Bad, because 資産を参照する agent 20 本すべてが同じ代替文 1 文を持つ。文言を変えるときは全 agent と `.ja/` を同じコミットで変える
- Bad, because plugin 起動での展開は公式ドキュメントの記述に基づき、実機では未測定

### Confirmation

`node --test tests/live-instructions.test.js` の "every agent naming a bundled asset pairs the plugin form with the fallback sentence" が通る。代替文を落とした場合と `~/.claude/agents/_lib/` を戻した場合の両方で落ちることを 2026-09-02 に確認した。

## Pros and Cons of the Options

### 二段パス

`${CLAUDE_PLUGIN_ROOT}/agents/_lib/foo.md` を裸で書き、導入段落の直後に代替文を置く。

- Good, because 検証なしで今日どちらの環境でも動く
- Good, because 判別が「`${` で始まるか」の 1 条件で、agent の裁量が入らない
- Bad, because 参照を持つ agent ごとに同じ 1 文が重複する

### `skills:` frontmatter で preload

`_lib` を `skills/use-context-<name>/` に移し、agent は `skills: [name]` で本文注入を受ける。

- Good, because パスが消え、環境判別そのものが要らなくなる
- Bad, because plugin 内の agent が裸の skill 名を同じ plugin の skill に解決するかをドキュメントが述べていない。解決失敗は warning を出して黙って skip する
- Bad, because plugin を install して `claude --debug` で確かめるまで採れない

### `${CLAUDE_PLUGIN_ROOT}` 単独

- Good, because 1 行で済む
- Bad, because dev tree では文字のまま残り、Read が失敗する。現在の運用がすべて dev tree なので即座に壊れる

### `~/.claude/` のまま理由だけ書く

- Good, because 変更が SUBAGENT.md の 1 段落で済む
- Bad, because plugin install は dev tree のコピーを読むか、何も読めない。DR-0083 が維持する plugin 起動と両立しない

## More Information

### Before / After comparison

| 観点                      | Before                                 | After                                                            |
| ------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| agent の資産参照          | `~/.claude/agents/_lib/foo.md`         | `${CLAUDE_PLUGIN_ROOT}/agents/_lib/foo.md` + 代替文 1 文         |
| plugin install での解決先 | dev tree のコピー、または無し          | plugin 配下の同じファイル                                        |
| 3 規約の整合              | SUBAGENT.md だけが `~/.claude/` を推奨 | 3 規約とも両環境で解決する形                                     |
| 検査                      | 無し                                   | `tests/live-instructions.test.js` が代替文と home 起点パスを検査 |

### Transition Plan

移行は 2026-09-02 に完了した。agent 20 本と `agents/_lib/calibration-examples.md`、`.ja/` の対応ファイル、SUBAGENT.md、`docs/wiki/path-reference-audit.md` を同じ変更単位で書き換えた。実行側のファイル (`~/.claude/settings.json`、`~/.claude/cache/changelog.md`) は配布資産ではないので据え置いた。

### Reassessment Triggers

- Claude Code が agent 本文で dev tree と plugin の両方で展開される変数を提供したとき
- plugin 内の agent が `skills:` の裸の名前を同じ plugin の skill に解決すると確認できたとき。preload に切り替えて代替文を消せる
- DR-0083 の build plugin を廃止し、plugin 起動が無くなったとき
- plugin install で実際に走らせ、`${CLAUDE_PLUGIN_ROOT}` が agent 本文で展開されないと分かったとき
