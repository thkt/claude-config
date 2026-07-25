---
name: use-cli-herdr
description: herdr-agentchat プラグイン経由で codex (coder) に実装を委譲し、2 ペイン会話で完成まで進める。
when_to_use: codex と連携, coder に委譲, coder に任せる, ペア実装, herdr で 2 agent, leader として実装依頼, agentchat, 2 ペイン会話, send で依頼
allowed-tools: Bash Read
user-invocable: false
---

# use-cli-herdr

## 前提

herdr ペイン内 (`HERDR_ENV=1`) で、thkt.agentchat プラグインが install 済みであること。send スクリプトの実体は `~/.config/herdr/plugins/github/thkt.agentchat-*/actions/send.sh` (glob で一意に解決できる)。codex exec や codex の直接起動は使わない。会話と完了中継の機構の外に出るため、報告が届かなくなる。

## Phase 1. セットアップ (冪等)

1. 自分を leader と命名する。`herdr agent rename "$HERDR_PANE_ID" leader`
2. coder を起動する。`herdr plugin action invoke thkt.agentchat.start-coder` (右ペインに codex が承認なしモードで立つ。結果は `herdr plugin log list --plugin thkt.agentchat`)
3. coder の初回ダイアログを解消する。`herdr agent read coder --source visible` に `Press t to trust` が見えたら `herdr agent send-keys coder t`、`Press enter to view hooks` が見えたら `herdr agent send-keys coder esc`。ダイアログ表示中に送った本文は吸われて消えるため、素の入力待ちを確認してから Phase 2 に進む

## Phase 2. 委譲

```bash
bash ~/.config/herdr/plugins/github/thkt.agentchat-*/actions/send.sh --reply-to leader coder "<指示>"
```

指示には対象ファイル、完了条件、書き込み範囲の制約を含める。`--reply-to leader` により coder への返信手段が本文に自動で埋め込まれる。

| exit | 意味                                               | 対応                                           |
| ---- | -------------------------------------------------- | ---------------------------------------------- |
| 0    | coder が着手した                                   | 報告を待つ                                     |
| 3    | 同一内容の連投                                     | 再送しない                                     |
| 5    | coder が blocked                                   | 人間の承認待ち。送らない                       |
| 6    | 起こせなかった (本文は入力欄に残っている可能性)    | 再送せず `herdr agent read coder` で画面を確認 |
| 7    | 着手を観測できず (すでに working 中なら届いている) | `herdr agent get coder` で状態確認。再送しない |

## Phase 3. 報告の受領

coder のターン完了は `[auto-relay]` メッセージとして自動で自分に届く。ポーリングは不要で、届くまで自分の作業を続けてよい。coder 自身の send 報告と auto-relay が重複したら send 報告を優先する。blocked 遷移は人間へ toast 通知されるため、leader が承認を肩代わりしない。受領後は検収 (テスト実行、diff 確認) してから次の指示または人間への報告に進む。
