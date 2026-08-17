---
name: outcome
description: .claude/OUTCOME.md を対話的に生成 / 更新する。不在や空 (Behavior が空か TBD のみ) なら AskUserQuestion で収集して stub を生成し、既存なら現状を提示して更新する。
when_to_use: OUTCOME作って, OUTCOME更新, アウトカム定義, create outcome, update outcome
allowed-tools: Read Write Edit AskUserQuestion Bash($HOME/.claude/skills/outcome/scripts/*)
model: opus
---

# /outcome - OUTCOME.md 生成 / 更新

他スキルが `OUTCOME.md` の不在を検知したときの受け皿。停止や警告で返すとアウトカムが空のまま残るので、対話で集めて生成する。

## 分岐

`${CLAUDE_SKILL_DIR}/scripts/validate-outcome.py .claude/OUTCOME.md` を実行し、JSON の `flow` が示すフローへ入る。判定基準はスクリプトが持ち、下表はその対応を読むためのもの。

| state  | 条件                           | flow     |
| ------ | ------------------------------ | -------- |
| absent | ファイル不在                   | generate |
| empty  | Behavior が空、または TBD のみ | generate |
| ok     | Behavior に中身がある          | update   |

## 生成

1. ${CLAUDE_SKILL_DIR}/templates/outcome.md を読む
2. Behavior、Non-goals、Constraints の 3 項目を AskUserQuestion 1 回で各 1 問ずつ収集する。Behavior は 1 つ以上で主体を明示する
3. 各 Behavior をアウトカムテストに通す。fail なら書き直してユーザーに再提示する
4. テンプレートに流し込み、`.claude/OUTCOME.md` を Write。収集しない冒頭文は書かず、Indicators はセクションごと落とす
5. validate-outcome.py を再実行し、`errors` が空になるまで直す。`placeholder_left` はプレースホルダの残り、`missing_section` は見出しの欠落

## 更新

1. `.claude/OUTCOME.md` を読み、現状の 3 セクションを提示
2. 変更するセクションとその内容を AskUserQuestion で確認
3. 変更後の Behavior をアウトカムテストに通してから Edit する
4. validate-outcome.py を再実行し、`errors` が空であることを確認する
