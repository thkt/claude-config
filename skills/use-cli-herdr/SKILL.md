---
name: use-cli-herdr
description: Delegate implementation to codex (coder) via the herdr-agentchat plugin and drive a two-pane conversation to completion.
when_to_use: codex と連携, coder に委譲, coder に任せる, ペア実装, herdr で 2 agent, leader として実装依頼, agentchat, 2 ペイン会話, send で依頼
allowed-tools: Bash Read
user-invocable: false
---

# use-cli-herdr

## Prerequisite

Run inside a herdr pane (`HERDR_ENV=1`) with the thkt.agentchat plugin installed. The send script lives at `~/.config/herdr/plugins/github/thkt.agentchat-*/actions/send.sh` (the glob resolves uniquely). Do not use codex exec or launch codex directly. That leaves the conversation and completion-relay machinery, so reports stop arriving.

## Phase 1. Setup (idempotent)

1. Name yourself leader. `herdr agent rename "$HERDR_PANE_ID" leader`
2. Start coder. `herdr plugin action invoke thkt.agentchat.start-coder` (codex starts in a right split in no-approval mode; check results with `herdr plugin log list --plugin thkt.agentchat`)
3. Clear coder's first-run dialogs. When `herdr agent read coder --source visible` shows `Press t to trust`, run `herdr agent send-keys coder t`; when it shows `Press enter to view hooks`, run `herdr agent send-keys coder esc`. A body sent while a dialog is showing gets swallowed, so confirm a bare input prompt before Phase 2

## Phase 2. Delegation

```bash
bash ~/.config/herdr/plugins/github/thkt.agentchat-*/actions/send.sh --reply-to leader coder "<instruction>"
```

Include target files, completion criteria, and write-scope constraints in the instruction. `--reply-to leader` embeds the reply command for coder into the body automatically.

| exit | Meaning                                                 | Response                                                      |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------- |
| 0    | coder started                                           | Wait for the report                                           |
| 3    | Identical resend                                        | Do not resend                                                 |
| 5    | coder is blocked                                        | Awaiting human approval. Do not send                          |
| 6    | Wake failed (body may sit unsubmitted in its input box) | Do not resend; check the screen with `herdr agent read coder` |
| 7    | Start not observed (delivered if already working)       | Check state with `herdr agent get coder`. Do not resend       |

## Phase 3. Receiving reports

Coder's turn completion arrives automatically as an `[auto-relay]` message. No polling is needed; continue your own work until it arrives. When coder's own send report and the auto-relay both arrive, prefer the send report. Blocked transitions are toast-notified to the human, so the leader does not stand in for approvals. After receipt, verify (run tests, check the diff) before the next instruction or the report to the human.
