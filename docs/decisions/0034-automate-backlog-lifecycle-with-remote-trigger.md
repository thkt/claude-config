---
status: "deprecated"
date: 2026-03-24
decision-makers: thkt
---

# ADR-0034: LaunchAgent によるバックログライフサイクル自動化

> Deprecated 2026-08-15: この決定が定めた構成要素はどれも現存しない。BACKLOG.md も pending.md も無く、書き込みを担う `/inbox` skill も `scheduled_tasks.json` も消えている。タスクの置き場は `~/todo/dotclaude.txt` と GitHub issue へ移った。唯一残っていた `hooks/lifecycle/statusline.sh` の期限表示は、読む先が無いまま毎回外れるだけだったので同じ回に削除した。

## Context and Problem Statement

BACKLOG.md は Claude が対話セッション中に管理するフラットな markdown ファイル。タスクソース（GitHub Issues, Slack）からの収集は手動で、セッションを開始しないと全体像が見えない。期限付きタスクのリマインドもない。プロジェクト数の増加に伴い、タスク散在による判断遅延と見落としリスクが顕在化している。

open-zeu（個人エージェントシステム）を参考に、自動収集 + push 通知 + ステージング承認のサイクルを導入する。

## Decision Drivers

- セッション開始前にタスク状況を把握したい（push 型）
- GitHub Issues と Slack から自動でタスクを拾いたい
- 期限付きタスクの見落としを防ぎたい
- BACKLOG.md の concurrent write を避けたい（DA-0034 指摘）
- 既存の/inbox スキルは read-only で維持したい

## Considered Options

### Option 1: /inbox スキル拡張（sync/remind/tidy サブコマンド追加）

/inbox に Write 権限を追加し、BACKLOG.md への書き込みと Discord 通知を担当させる。

- Good: 新スキル不要
- Bad: read-only スキルが state-mutator に変質（ADR-0001 の責務分離違反）
- Bad: RemoteTrigger と対話セッションが同一ファイルに書く concurrent write 問題
- Bad:/inbox の allowed-tools に Write, Discord reply 追加で肥大化

### Option 2: RemoteTrigger + pending.md ステージング（採用）

RemoteTrigger が定期的にソースをスキャンし、pending.md に書き出す。BACKLOG.md への書き込みは対話セッションのみ。Discord で期限リマインドを push。

- Good: BACKLOG.md の writer が対話セッションに限定される（単一ライター）
- Good: pending.md はトリガーが毎回全書き換え（parse 不要、ミスの元がない）
- Good:/inbox は変更なし
- Good: ライフサイクルの異なるデータを分離（永続台帳 vs 使い捨てスキャン結果）
- Bad: ファイルが 1 つ増える（pending.md）
- Bad: SESSION_START が 2 ファイル読む必要がある

### Option 3: BACKLOG.md 内に Pending セクション追加（1ファイル統合）

BACKLOG.md の末尾に `## Pending` セクションを設け、トリガーがそこだけ書き換える。

- Good: ファイル 1 つで完結
- Bad: トリガーが BACKLOG.md を parse → 特定セクションだけ差し替え → 書き戻しが必要（LLM のミスリスク）
- Bad: concurrent write 問題が残る（同一ファイル）
- Bad: 1 ファイル内でライフサイクルの異なるデータが混在

## Decision Outcome

Option 2: 定期ジョブ + pending.md ステージング。

実装時に RemoteTrigger（Anthropic Cloud）はローカルリソース（ファイル、env、gh CLI）にアクセスできない制約が判明。既存の LaunchAgent + `claude -p` パターン（pr-preview 等と同一）で実装。

### データフロー

```text
LaunchAgent → run.sh → claude -p (朝/夕 cron)
  ├─ READ:  GitHub Issues (gh) + Slack (slack-search.sh) + BACKLOG.md
  ├─ WRITE: ~/.claude/workspace/inbox/pending.md
  └─ PUSH:  期限3日以内 → Discord DM

SESSION_START (対話セッション)
  ├─ READ:  BACKLOG.md + pending.md
  ├─ 提示:  pending タスクの採用/棄却を確認
  └─ WRITE: BACKLOG.md のみ（承認分を反映、pending から削除）
```

### ファイル責務

| ファイル   | Writer             | 性質                 | 更新方式       |
| ---------- | ------------------ | -------------------- | -------------- |
| BACKLOG.md | 対話セッションのみ | 永続的な管理台帳     | 行単位の編集   |
| pending.md | トリガーのみ       | 使い捨てスキャン結果 | 毎回全書き換え |

### BACKLOG.md 構造変更

| 変更         | Before                              | After                                       |
| ------------ | ----------------------------------- | ------------------------------------------- |
| 列           | Project, Version, Status, Next/Note | Project, Status, Deadline, Source, Next     |
| Active Focus | 末尾に手動維持                      | 廃止（status: next/in-progress でフィルタ） |
| Deadline     | Next/Note に埋め込み                | 独立列（手動管理）                          |
| Source       | なし                                | manual / github:org/repo#N / slack:channel  |

### ジョブ設計

| 項目             | 値                                                       |
| ---------------- | -------------------------------------------------------- |
| 実行基盤         | macOS LaunchAgent + `claude -p`（ヘッドレス）            |
| スケジュール     | 朝 8:57 + 夕 17:43                                       |
| ソース           | GitHub Issues (gh CLI) + Slack (slack-search.shラッパー) |
| 出力             | pending.md（新規タスク）+ Discord DM（期限リマインド）   |
| BACKLOG 書き込み | しない                                                   |
| ジョブ配置       | ~/Personal/jobs/backlog-sync/                            |

### shields 対策

Slack トークンを `claude -p` の Bash コマンドに露出させると shields の secrets check にマスクされる。pr-preview の slack-post.sh と同じパターンで、`slack-search.sh` ラッパースクリプトに閉じ込めて回避。

### /inbox の扱い

変更なし。自動収集が LaunchAgent に移行するため、/inbox は徐々に不要になる。明示的な廃止はしない（使いたければ使える）。

## Consequences

### Positive

- 期限付きタスクの見落し防止（Discord push）
- タスクソースからの自動収集（手動確認不要）
- BACKLOG.md の concurrent write 回避
- SESSION_START でのタスク判断が高速化

### Negative

- pending.md という新概念の導入（認知負荷微増）
- トリガーの GitHub/Slack スキャン精度は LLM 依存
- LaunchAgent は Mac 起動中のみ動作（リモート実行不可）

## Links

- open-zeu (参考): <https://github.com/bradwmorris/open-zeu>
- ADR-0001: code command responsibility separation
- DA challenge: concurrent write, 責務分離違反, Deadline 列の過剰設計
- ジョブ実装: ~/Personal/jobs/backlog-sync/
- LaunchAgent: ~/Library/LaunchAgents/com.thkt.backlog-sync.plist
