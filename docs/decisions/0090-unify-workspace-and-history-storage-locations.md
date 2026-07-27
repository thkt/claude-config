---
status: "accepted"
date: "2026-07-28"
decision-makers: "thkt"
---

# Unify workspace and history storage locations

## Context and Problem Statement

skill と workflow が作業成果物の置き場所を 2 通りに書いていた。生成側 (research/think/issue/build.js/assert.js) は `.claude/workspace/`、消費側 (scribe/reviewer-conformance/research の完了条件) と rules は `workspace/` を指す。実体もこのリポジトリで `workspace/` に 809 件、`.claude/workspace/` に 11 件と割れていた。

他プロジェクトのルート直下に `workspace/` は存在しないので、`workspace/` と書いている参照はそこで壊れる。scribe が research の出力を読めない形になる。

## Decision Drivers

- 他プロジェクトで実行したときに参照が解決すること
- 生成側と消費側が同じディレクトリを指すこと
- audit の実行記録はプロジェクト横断なので、プロジェクトの作業領域と混ぜないこと

## Considered Options

- `.claude/workspace/` に統一し、history は workspace の外へ出す
- `workspace/` に統一する
- 実行時にリポジトリルート名で判定して切り替える

## Decision Outcome

Chosen option: "`.claude/workspace/` に統一し、history は workspace の外へ出す"。他プロジェクトでは `<project>/.claude/` がハーネスの領域なので、そこに揃えれば参照が常に解決する。history は audit が `$HOME` 固定で書くプロジェクト横断の記録で、プロジェクトの作業領域とは性質が違うため `~/.claude/history/` へ分けた。

### Consequences

- Good, because 生成側と消費側が同じパスを指し、他プロジェクトで scribe と reviewer-conformance が壊れなくなる
- Good, because history が workspace から外れ、「プロジェクトの作業成果物」と「ハーネスの実行記録」が置き場所で区別できる
- Bad, because このリポジトリでは `~/.claude/.claude/workspace/` と `.claude` が 2 回並ぶ
- Bad, because DR-0024/0027/0038/0039/0043/0044/0062/0072/0073/0077 が `workspace/...` を出典として引いており、その参照先が実在しなくなる。これらは歴史記録として据え置く

### Confirmation

参照側は `git grep -P '(?<!\.claude/)(?<![\w/.])workspace/'` が docs/decisions と attic を除いて 0 件になること。実体側は `workspace/` が存在せず、`.claude/workspace/` に research/planning/delta/drafts/doc-templates が、`~/.claude/history/` に audit 記録があること。

## More Information

### Before / After comparison

| 対象                          | Before                                      | After                       |
| ----------------------------- | ------------------------------------------- | --------------------------- |
| research / planning / delta   | `workspace/` と `.claude/workspace/` に分散 | `.claude/workspace/`        |
| drafts / doc-templates        | `workspace/`                                | `.claude/workspace/`        |
| audit 実行記録                | `workspace/history/`                        | `~/.claude/history/`        |
| scribe / reviewer-conformance | `workspace/` を参照                         | `.claude/workspace/` を参照 |
| audit.js / snapshot.py / fix  | `$HOME/.claude/workspace/history/`          | `$HOME/.claude/history/`    |

### Transition Plan

実体は `.gitignore` 配下なので移動しても git diff に出ない。移動は 1 回で完了し、参照修正 18 ファイルと `.gitignore` への `history/` 追加が PR に乗る。同名衝突は `planning/2026-07-03-issue-workflow-gate/plan.md` の 1 件で、既存を `plan-1820.md` へ退避して両方を残した。

### Review Schedule

他プロジェクトで `/research` と scribe を実行し、参照が解決することを確認した時点で完了とする。

### Reassessment Triggers

- `~/.claude/.claude/` の二重パスが実務で読み違いを生んだとき
- history 以外にもプロジェクト横断の記録が増え、`~/.claude/` 直下が散らかったとき
- Claude Code が workspace の標準的な置き場所を規定したとき
