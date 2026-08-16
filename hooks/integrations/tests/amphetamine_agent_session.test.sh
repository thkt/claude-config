#!/usr/bin/env bash
# Integration tests for integrations/amphetamine-agent-session.py (UserPromptSubmit / PostToolUse / Stop hook)
# osascript is replaced by a stub on PATH, so the assertions read the commands the hook
# sent to Amphetamine rather than the state of a real Mac.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../tests/helpers.sh"
HOOK="$SCRIPT_DIR/../amphetamine-agent-session.py"

TEST_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/amphetamine-testXXXXXX")
trap 'rm -rf "$TEST_TMPDIR"' EXIT

STUB_BIN="$TEST_TMPDIR/bin"
mkdir -p "$STUB_BIN"
cat > "$STUB_BIN/osascript" <<'STUB'
#!/bin/sh
# Records every command the hook sends and answers `session time remaining` with the
# value the test pinned in STUB_REMAINING.
printf '%s\n' "$*" >> "$OSASCRIPT_LOG"
case "$*" in
  *"session time remaining"*) printf '%s\n' "${STUB_REMAINING:--3}" ;;
esac
exit 0
STUB
chmod +x "$STUB_BIN/osascript"

# A directory standing in for the installed app, so the suite runs on a machine without it.
FAKE_APP="$TEST_TMPDIR/Amphetamine.app"
mkdir -p "$FAKE_APP"

# Each test gets its own state directory, so a marker never leaks between tests or from a
# real run on this machine.
fresh_state() { mktemp -d "$TEST_TMPDIR/stateXXXXXX"; }

make_json() {
  local session_id="${1:-test-session}" agent_id="${2:-}"
  if [[ -n "$agent_id" ]]; then
    jq -nc --arg s "$session_id" --arg a "$agent_id" '{session_id:$s,agent_id:$a}'
  else
    jq -nc --arg s "$session_id" '{session_id:$s,hook_event_name:"Stop"}'
  fi
}

# remaining is the value osascript reports before the call. app overrides the app directory.
run_hook() {
  local action="$1" session_id="${2:-test-session}" remaining="${3:--3}" agent_id="${4:-}" app="${5:-$FAKE_APP}"
  run_hook_payload "$action" "$(make_json "$session_id" "$agent_id")" "$remaining" "$app"
}

# Feeds the hook a payload the test wrote by hand, for shapes make_json does not cover.
run_hook_payload() {
  local action="$1" payload="$2" remaining="${3:--3}" app="${4:-$FAKE_APP}"
  printf '%s' "$payload" | (
    export PATH="$STUB_BIN:$PATH"
    export OSASCRIPT_LOG="$LOG"
    export STUB_REMAINING="$remaining"
    export CLAUDE_AMPHETAMINE_STATE_DIR="$STATE_DIR"
    export CLAUDE_AMPHETAMINE_APP="$app"
    "$HOOK" "$action"
  ) 2>/dev/null
}

marker_count() { find "$STATE_DIR" -type f -name 'session-*' 2>/dev/null | wc -l | tr -d ' '; }

marker_for() { printf '%s/session-%s' "$STATE_DIR" "$1"; }

bg_marker_count() { find "$STATE_DIR" -type f -name 'bg-*' 2>/dev/null | wc -l | tr -d ' '; }

bg_marker_for() { printf '%s/bg-%s' "$STATE_DIR" "$1"; }

setup() {
  STATE_DIR=$(fresh_state)
  LOG="$TEST_TMPDIR/osascript-$RANDOM.log"
  : > "$LOG"
}

test_acquire_starts_a_session() {
  echo "T-001: セッションが無ければ start new session を送り、マーカーを残す"
  local STATE_DIR LOG
  setup
  run_hook acquire session-a -3
  assert_contains "sends start new session" "start new session" "$(cat "$LOG")"
  # The finite duration is the dead-man's switch: a killed process leaves no Stop hook,
  # and an infinite session would then keep the Mac awake until someone notices.
  assert_contains "asks for a finite duration" "duration:60, interval:minutes" "$(cat "$LOG")"
  assert_eq "one marker written" "1" "$(marker_count)"
}

test_acquire_leaves_a_foreign_session_alone() {
  echo "T-002: 手動セッションが動いていれば何も送らない"
  local STATE_DIR LOG
  setup
  # 0 is Amphetamine's code for an infinite session, which only a person starts by hand.
  run_hook acquire session-a 0
  assert_empty "no command sent" "$(cat "$LOG" | grep -F 'start new session' || true)"
  assert_eq "no marker written" "0" "$(marker_count)"
}

test_acquire_refreshes_a_session_it_owns() {
  echo "T-003: 自分のマーカーがあれば、残り時間があっても発行し直す"
  local STATE_DIR LOG
  setup
  run_hook acquire session-a -3
  : > "$LOG"
  run_hook acquire session-a 1800
  assert_contains "sends start new session again" "start new session" "$(cat "$LOG")"
  assert_eq "still one marker" "1" "$(marker_count)"
}

test_release_ends_the_last_session() {
  echo "T-004: 最後の 1 本が閉じたら end session を送る"
  local STATE_DIR LOG
  setup
  run_hook acquire session-a -3
  : > "$LOG"
  run_hook release session-a 1800
  assert_contains "sends end session" "end session" "$(cat "$LOG")"
  assert_eq "marker removed" "0" "$(marker_count)"
}

test_release_keeps_another_process_awake() {
  echo "T-005: 他プロセスがターン中なら end session を送らない"
  local STATE_DIR LOG
  setup
  run_hook acquire session-a -3
  run_hook acquire session-b -3
  : > "$LOG"
  run_hook release session-a 1800
  assert_not_contains "no end session" "end session" "$(cat "$LOG")"
  assert_eq "the other marker stays" "1" "$(marker_count)"
}

test_a_second_process_joins_the_count() {
  echo "T-018: 先行プロセスのセッション中に始まったターンも参照に数える"
  # 実機では 1 本目が start した直後から remaining が正の値を返すので、2 本目の acquire は
  # 必ずこの経路に入る。ここで数えそこねると、1 本目の release が最後の 1 本と誤認する。
  local STATE_DIR LOG
  setup
  run_hook acquire session-a -3
  run_hook acquire session-b 1800
  assert_eq "both processes hold a marker" "2" "$(marker_count)"
  : > "$LOG"
  run_hook release session-a 1800
  assert_not_contains "no end session while session-b works" "end session" "$(cat "$LOG")"
}

test_a_manual_session_is_still_left_alone() {
  echo "T-019: マーカーが 1 つも無い状態のセッションは手動とみなして触らない"
  local STATE_DIR LOG
  setup
  : > "$LOG"
  run_hook acquire session-a 1800
  assert_empty "no session started" "$(grep -F 'start new session' "$LOG" || true)"
  assert_eq "no marker" "0" "$(marker_count)"
}

test_release_leaves_an_infinite_session_alone() {
  echo "T-006: 途中で手動の無期限セッションへ変わっていたら閉じない"
  local STATE_DIR LOG
  setup
  run_hook acquire session-a -3
  : > "$LOG"
  run_hook release session-a 0
  assert_not_contains "no end session" "end session" "$(cat "$LOG")"
}

test_release_leaves_a_longer_session_alone() {
  echo "T-007: 自分の発行した長さを越える残り時間なら閉じない"
  local STATE_DIR LOG
  setup
  run_hook acquire session-a -3
  : > "$LOG"
  # 2 hours: longer than the 60 minutes this hook ever asks for, so a person set it.
  run_hook release session-a 7200
  assert_not_contains "no end session" "end session" "$(cat "$LOG")"
}

test_subagent_payload_is_ignored() {
  echo "T-008: subagent 由来の呼び出しは何も送らない"
  local STATE_DIR LOG
  setup
  run_hook acquire session-a -3 agent-1
  assert_empty "nothing sent" "$(cat "$LOG")"
  assert_eq "no marker written" "0" "$(marker_count)"
}

test_missing_app_is_silent() {
  echo "T-009: Amphetamine が無ければ黙って抜ける"
  local STATE_DIR LOG output
  setup
  output=$(run_hook acquire session-a -3 "" "$TEST_TMPDIR/absent.app")
  assert_empty "no output" "$output"
  assert_empty "nothing sent" "$(cat "$LOG")"
}

test_stale_marker_is_swept() {
  echo "T-010: 8 時間を越えたマーカーは捨てられ、参照数を止めない"
  local STATE_DIR LOG stale exists
  setup
  run_hook acquire session-a -3
  run_hook acquire session-b -3
  stale="$(marker_for session-b)"
  # touch creates a missing path, so a renamed marker scheme would leave a decoy behind
  # and the sweep would look like it worked. Read the real path before backdating it.
  exists=$([[ -f "$stale" ]] && echo yes || echo no)
  assert_eq "the marker to backdate exists" "yes" "$exists"
  touch -t 202001010000 "$stale"
  : > "$LOG"
  run_hook release session-a 1800
  assert_contains "sends end session" "end session" "$(cat "$LOG")"
  assert_eq "both markers gone" "0" "$(marker_count)"
}

test_unknown_action_is_silent() {
  echo "T-011: acquire/release 以外の引数では何も送らない"
  local STATE_DIR LOG
  setup
  run_hook status session-a -3
  assert_empty "nothing sent" "$(cat "$LOG")"
}

test_background_from_a_subagent_keeps_the_mac_awake() {
  echo "T-012: subagent 由来の tool 呼び出しはセッションを発行し直し、bg マーカーを残す"
  local STATE_DIR LOG
  setup
  run_hook_payload background "$(jq -nc '{session_id:"session-a",agent_id:"agent-1",tool_name:"Bash"}')" -3
  assert_contains "sends start new session" "start new session" "$(cat "$LOG")"
  assert_eq "one bg marker written" "1" "$(bg_marker_count)"
}

test_background_from_a_workflow_launch() {
  echo "T-013: 本体ターンの Workflow 起動も bg マーカーを残す"
  local STATE_DIR LOG
  setup
  run_hook_payload background "$(jq -nc '{session_id:"session-a",tool_name:"Workflow"}')" -3
  assert_contains "sends start new session" "start new session" "$(cat "$LOG")"
  assert_eq "one bg marker written" "1" "$(bg_marker_count)"
}

test_background_ignores_a_quoted_agent_id() {
  echo "T-014: agent_id という文字列を含むだけの本体呼び出しは捨てる"
  local STATE_DIR LOG
  setup
  # An empty agent_id passes the shell substring filter, so this payload is the one that
  # reaches the python check. A main-turn Bash call must not be read as subagent-origin.
  run_hook_payload background "$(jq -nc '{session_id:"session-a",tool_name:"Bash",agent_id:""}')" -3
  assert_empty "an empty agent_id sends nothing" "$(cat "$LOG")"
  # This hook and its test file carry the literal agent_id in their text. JSON escapes the
  # quotes inside tool_input, so the substring filter never sees them as a key.
  run_hook_payload background \
    "$(jq -nc '{session_id:"session-a",tool_name:"Write",tool_input:{content:"case $payload in *\"agent_id\"*)"}}')" -3
  assert_empty "quoted text in tool_input sends nothing" "$(cat "$LOG")"
  assert_eq "no bg marker written" "0" "$(bg_marker_count)"
}

test_background_throttles_repeat_calls() {
  echo "T-015: 直近に発行済みなら osascript を呼ばない"
  local STATE_DIR LOG
  setup
  run_hook_payload background "$(jq -nc '{session_id:"session-a",agent_id:"agent-1"}')" -3
  : > "$LOG"
  run_hook_payload background "$(jq -nc '{session_id:"session-a",agent_id:"agent-1"}')" -3
  assert_empty "nothing sent" "$(cat "$LOG")"
  assert_eq "still one bg marker" "1" "$(bg_marker_count)"
}

test_background_leaves_a_foreign_session_alone() {
  echo "T-016: 手動セッションが動いていれば bg マーカーを作らない"
  local STATE_DIR LOG
  setup
  run_hook_payload background "$(jq -nc '{session_id:"session-a",agent_id:"agent-1"}')" 0
  assert_empty "no command sent" "$(cat "$LOG" | grep -F 'start new session' || true)"
  assert_eq "no bg marker written" "0" "$(bg_marker_count)"
}

test_release_extends_while_a_workflow_runs() {
  echo "T-017: bg マーカーが新しければ end session でなくセッションを発行し直す"
  local STATE_DIR LOG
  setup
  run_hook acquire session-a -3
  run_hook_payload background "$(jq -nc '{session_id:"session-a",agent_id:"agent-1"}')" 1800
  : > "$LOG"
  run_hook release session-a 1800
  assert_not_contains "no end session" "end session" "$(cat "$LOG")"
  assert_contains "sends start new session" "start new session" "$(cat "$LOG")"
  assert_eq "the bg marker stays" "1" "$(bg_marker_count)"
}

test_release_closes_when_the_bg_marker_went_stale() {
  echo "T-018: bg マーカーが古びていれば end session を送り、マーカーを消す"
  local STATE_DIR LOG stamp
  setup
  run_hook acquire session-a -3
  run_hook_payload background "$(jq -nc '{session_id:"session-a",agent_id:"agent-1"}')" 1800
  # 20 minutes back: past the freshness window the release path reads, and short of the
  # 8-hour sweep, so the assertion covers the freshness test rather than the sweep.
  stamp=$(python3 -c 'import time; print(time.strftime("%Y%m%d%H%M", time.localtime(time.time() - 1200)))')
  touch -t "$stamp" "$(bg_marker_for session-a)"
  : > "$LOG"
  run_hook release session-a 1800
  assert_contains "sends end session" "end session" "$(cat "$LOG")"
  assert_eq "the bg marker is gone" "0" "$(bg_marker_count)"
}

echo "=== amphetamine-agent-session.sh tests ==="
test_acquire_starts_a_session
test_acquire_leaves_a_foreign_session_alone
test_acquire_refreshes_a_session_it_owns
test_release_ends_the_last_session
test_release_keeps_another_process_awake
test_a_second_process_joins_the_count
test_a_manual_session_is_still_left_alone
test_release_leaves_an_infinite_session_alone
test_release_leaves_a_longer_session_alone
test_subagent_payload_is_ignored
test_missing_app_is_silent
test_stale_marker_is_swept
test_unknown_action_is_silent
test_background_from_a_subagent_keeps_the_mac_awake
test_background_from_a_workflow_launch
test_background_ignores_a_quoted_agent_id
test_background_throttles_repeat_calls
test_background_leaves_a_foreign_session_alone
test_release_extends_while_a_workflow_runs
test_release_closes_when_the_bg_marker_went_stale

report_results
