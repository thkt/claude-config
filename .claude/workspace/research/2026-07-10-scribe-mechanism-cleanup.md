# Research: scribe-mechanism-cleanup

Generated: 2026-07-10
Session: 067b5356-dc8c-40d9-9f1f-8dc428c7ae3b
Intent: Feature planning
Domain: Infrastructure
Prior research: none found

## Purpose

scribe 機構の整理 chore に向けて、SETUP.md と `/scribe-setup` スキルの重複範囲、未マージ PR スキップ経路への人間可視化の追加余地、`run.sh` のハードコード依存と外部 `check-workday.sh` 呼び出し形を、実ファイルの file:line から確定する。実装はしない。

## Key Findings

| Priority    | Finding                                                                                                                                                                                                                                                                       | Source                                                               | Next Action                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| High (Q1)   | SETUP.md L17-38「対象リポを1つ追加する」の 2 手順は `/scribe-setup` スキル Phase 2/3 とコマンドがバイト等価の重複。`mkdir -p ... && cp ...template.md` と `gh label create scribe ... -c '#0E8A16' ...` が両方に存在。L19 自身が「推奨は /scribe-setup スキル」と明言している | SETUP.md:25-28, 36-37 / SKILL.md:31-34, 42-44                        | この節を削り、スキルへのポインタ 1 行に置換                                       |
| High (Q1)   | SETUP.md 固有で残すべき内容: launchd/plist 節 (L47-50)、state を持たない設計理由 (L15)、承認フロー + 未マージ PR スキップ (L52-57)、構成テーブル (L6-13)、巡回モード (L44)。いずれもスキルに存在しない                                                                        | SETUP.md:6-15, 44, 47-57 / SKILL.md 全文に launchd/巡回/承認記述なし | 保持                                                                              |
| High (Q3)   | 構成テーブル L10 が `run.sh` の役割に「平日判定」を帰属させているが、平日判定は外部 `check-workday.sh` に委譲されている。run.sh は判定せず呼ぶだけ                                                                                                                            | SETUP.md:10 vs run.sh:23                                             | L10 を「巡回（平日判定は check-workday.sh に委譲 + 対象リポ自動検出）」へ訂正     |
| High (Q3)   | `SCAN_ROOTS` は変数として実在しない。SETUP.md L15/L44、run.sh L5 コメント、SKILL.md L27 が変数のように参照するが、実際の巡回根は run.sh:24 の for ループにインラインでハードコード (`"$HOME/Personal" "$HOME"/GitHub/*/*`)。grep 0 hit で確認済み                             | run.sh:24 / grep 結果 (Disconfirmation 参照)                         | SETUP.md の記述を「変数」から「run.sh:24 にハードコードされた巡回根」へ honest 化 |
| Medium (Q3) | 外部依存 `check-workday.sh` の呼び出し形: `"$HOME/.claude/lib/check-workday.sh" "$LOG_DIR" \|\| { echo "平日ではないためスキップ"; exit 0; }`。引数は LOG_DIR 1 個、exit 1 = 非平日でスキップ                                                                                 | run.sh:23 / lib/check-workday.sh:1-33                                | 構成テーブルに外部依存行を追加検討                                                |
| Medium (Q3) | `SCRIBE_DIR` (L13) と `LOG_DIR` (L14) は `BASH_SOURCE` から派生、ハードコードではない。真のハードコードは (a) 巡回根 run.sh:24、(b) 外部 lib パス `$HOME/.claude/lib/check-workday.sh` run.sh:23、(c) label 名 `scribe` の各 gh 呼び出し                                      | run.sh:13-14, 23-24, 42, 46                                          | SETUP.md の「run.sh が全処理」表現を外部 lib 依存ありに補正                       |
| Medium (Q2) | 未マージ PR スキップ経路 (run.sh:42-43) は `echo` のみで通知なし。ハーネス全体に視覚/デスクトップ通知機構は存在しない (osascript/terminal-notifier/desktop grep 空)。既存 notify は全て afplay 音声                                                                           | run.sh:42-43 / settings.json:131-176 / hooks/lib/notify.sh:1-7       | 下記参照                                                                          |
| Medium (Q2) | run.sh から再利用可能な唯一の通知単位は `hooks/lib/notify.sh` の `play_sound()`（source 可能・bash 互換・afplay ラッパー）。`notify-stop*.sh` は stdin JSON 駆動の Stop hook 専用で run.sh から呼べない                                                                       | hooks/lib/notify.sh:1-7 / hooks/notify-stop.sh:1-28                  | 音声で良ければ `source notify.sh; play_sound`。視覚化は net-new                   |
| Low (Q2)    | run.sh は launchd バックグラウンド実行のため音声通知は人間不在時に無意味。真の可視化は Slack (lib/ensure-slack-token.sh 既存) か永続ログが必要で、いずれも net-new                                                                                                            | run.sh 巡回=launchd (SETUP.md:47-50) / lib/ensure-slack-token.sh     | Slack or ログ追記を feature 候補として /think へ                                  |

## Available Data

| Type   | Item                                   | Note                                                       |
| ------ | -------------------------------------- | ---------------------------------------------------------- |
| File   | `scribe/run.sh` (81 行)                | 機構本体。巡回根ハードコード run.sh:24、外部依存 run.sh:23 |
| File   | `scribe/SETUP.md` (57 行)              | 訂正対象。編集可                                           |
| File   | `skills/scribe-setup/SKILL.md` (54 行) | 重複元。Q1 制約により本体は触らない                        |
| File   | `lib/check-workday.sh` (33 行)         | 外部依存。引数 LOG_DIR、exit 1=非平日                      |
| File   | `hooks/lib/notify.sh` (7 行)           | 再利用可能な play_sound() source 単位                      |
| File   | `hooks/notify-stop.sh` (28 行)         | stdin 駆動 Stop hook。run.sh から流用不可                  |
| File   | `lib/ensure-slack-token.sh`            | Slack 可視化の net-new 経路候補                            |
| Config | `settings.json:131-176`                | Notification hook は afplay のみ、視覚通知ゼロ             |

## Constraints

| Category   | Constraint                                                                              |
| ---------- | --------------------------------------------------------------------------------------- |
| Scope (Q1) | 編集は SETUP.md のみ。`/scribe-setup` スキル本体は変更しない                            |
| Fidelity   | SETUP.md 訂正は実コードに honest であること (SCAN_ROOTS 虚構・平日判定の帰属誤りを解消) |
| Non-goal   | 実装しない。本 research は planning のみ                                                |

## Disconfirmation Check

`SCAN_ROOTS` が変数として実在するかの反証確認。scribe/ 配下 grep:

```
$ grep -rn 'SCAN_ROOTS' ~/.claude/scribe ~/.claude/skills/scribe-setup ~/.claude/lib
scribe/SETUP.md:15: ... `run.sh` の SCAN_ROOTS 配下で ...
scribe/SETUP.md:44: ...（平日のみ。SCAN_ROOTS から自動検出）
scribe/run.sh:5:# ... SCAN_ROOTS ... (コメント行)
skills/scribe-setup/SKILL.md:27: ... run.sh の SCAN_ROOTS（`~/Personal`, `~/GitHub/*/*`）の外なら ...
```

変数定義 (`SCAN_ROOTS=`) は 0 hit。全て散文/コメント内の参照であり、実際の巡回根は run.sh:24 の for ループにインライン。よって「SCAN_ROOTS という変数がある」は虚構と確定。0 hit を tool 誤用でなく実不在と判断する根拠は、同 grep が散文参照は拾えている（フィルタは機能している）こと。

prior-research の存在確認 (bfs `.claude/workspace/research`): none found（過去の scribe research ファイルなし）。

## References

| Path                         | Description                           |
| ---------------------------- | ------------------------------------- |
| scribe/run.sh                | 機構本体。行番号は本文中 file:line    |
| scribe/SETUP.md              | 訂正対象ドキュメント                  |
| skills/scribe-setup/SKILL.md | 重複元スキル（不可侵）                |
| lib/check-workday.sh         | 外部平日判定依存                      |
| hooks/lib/notify.sh          | 再利用可能 play_sound()               |
| settings.json:131-176        | Notification hook 定義（afplay のみ） |

## Coverage Notes

- Q2 の「視覚化を既存機構で足せるか」への答えは No（音声のみ）。真の可視化は Slack か永続ログの net-new で、これは /think での feature 判断に委ねる。
- Advisor: unavailable（ツールがこのセッションで利用不可のため呼べず）。代替として全 5 ファイルを逐語 read 済みで、findings は全て file:line か raw grep に紐付く。
- explorer-feature をスキップ: Feature planning では原則起動だが、対象が 5 ファイル計 約250 行で全て逐語 read 済みのため、実行経路追跡の追加価値がなく重複と判断。
- 未確認: launchd plist (`~/Library/LaunchAgents/com.thkt.scribe.plist`) の実 ProgramArguments は本 research で未読。SETUP.md の launchd 記述の正しさを詰めるなら次段で読む。

## Next Steps

| Intent           | Next Command |
| ---------------- | ------------ |
| Feature planning | `/think`     |
