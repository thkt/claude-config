---
name: use-context-root-cause-analysis
description: 仮説の消去による根本原因分析。
when_to_use: root cause, 5 Whys, なぜなぜ分析, 根本原因, 原因分析, symptom fix, 対症療法
allowed-tools: Read Agent Bash(ugrep:*) Bash(bfs:*)
context: fork
user-invocable: false
---

# 根本原因分析

## 原則

症状ではなく根本原因を修正する。対症療法は複雑性を増やし、根本原因の修正は再発を防ぐ。

## 手法

${CLAUDE_SKILL_DIR}/../../rules/core/OPERATION.md § Debug Investigation Protocol が正。fork 実行では常時ロードの rules が届かないので、手順をここに写す。

1. 動く類似コードと壊れたコードを差分比較し、違いを列挙する
2. 原因の仮説を 3 つ以上立てる。候補の出どころは ${CLAUDE_SKILL_DIR}/references/symptom-patterns.md
3. 各仮説を検証で潰す。1 つに絞れないうちは結論を出さない
4. 残った仮説が根本原因。「これを直せば症状が消えるか」で確かめる

| 落とし穴           | 扱い                                                    |
| ------------------ | ------------------------------------------------------- |
| 最初の仮説で止まる | 3 つ揃うまで検証を始めない                              |
| 仮説を検証せず消す | 消す根拠は実行結果か証拠。もっともらしさでは消さない    |
| 抽象へ流れる       | アクションが取れる高さで止める。設計論まで遡らない      |
| 仮説が全部残る     | 差分比較の粒度を上げ、違いを 1 つずつ切り分けて再度潰す |

## Pattern の判定

Pattern は原因の深さでなく再発経路の有無で決まる。root cause と同じ形のコードが他にあるかを走査して分類する。

| 値         | 判定                                     |
| ---------- | ---------------------------------------- |
| Isolated   | 同じ形が他に無い                         |
| Recurring  | 近くに同じ形がある                       |
| Systematic | 設計から生じ、同じ形が層をまたいで現れる |

## 出力フォーマット

利用側は Pattern で分岐する。`/fix` は defense-in-depth を適用するか `/research` へ委譲するかを決める。

| フィールド | 説明                              |
| ---------- | --------------------------------- |
| Symptom    | ユーザーから見た失敗              |
| Root cause | 検証で残った仮説                  |
| Pattern    | Isolated / Recurring / Systematic |

## 参照ファイル

| 迷うこと           | ファイル                                              |
| ------------------ | ----------------------------------------------------- |
| 仮説をどう立てるか | ${CLAUDE_SKILL_DIR}/references/symptom-patterns.md    |
| 消去がどう進むか   | ${CLAUDE_SKILL_DIR}/references/hypothesis-examples.md |
