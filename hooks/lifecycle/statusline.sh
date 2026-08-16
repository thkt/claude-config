#!/bin/zsh
set +e

# Failure mode: fail-open (partial display is acceptable)

STATE_TTL_DAYS=7

sep() { [ -n "$RENDERED" ] && printf ' \033[90m│\033[0m '; RENDERED=1; }
color_for_pct() {
    if [ "$1" -lt 50 ]; then printf '\033[32m'
    elif [ "$1" -lt 80 ]; then printf '\033[33m'
    else printf '\033[31m'; fi
}

parse_stdin() {
    local stdin_input
    [ ! -t 0 ] && stdin_input=$(cat)
    [ -z "${stdin_input:-}" ] && return
    command -v jq &>/dev/null || return

    local parsed
    parsed=$(printf '%s' "$stdin_input" | jq -r '
      [
        (.model.display_name? // ""),
        (.model.id? // ""),
        (.session_id // ""),
        (.cost.total_cost_usd? // ""),
        (.context_window.total_input_tokens? // ""),
        (.context_window.context_window_size? // ""),
        (.context_window.used_percentage? // ""),
        (.rate_limits.five_hour.used_percentage? // "" | if . == "" then "" else floor end),
        (.rate_limits.seven_day.used_percentage? // "" | if . == "" then "" else floor end),
        (if .context_window.current_usage? then (.context_window.current_usage.cache_read_input_tokens // 0) else 0 end),
        (if .context_window.current_usage? then (.context_window.current_usage.cache_creation_input_tokens // 0) else 0 end),
        (.worktree.name? // ""),
        (.worktree.branch? // ""),
        (.worktree.original_cwd? // ""),
        (.workspace.git_worktree? // false | if . then "1" else "" end),
        (.effort.level? // ""),
        (.fast_mode? // false | if . then "1" else "" end),
        (.rate_limits.five_hour.resets_at? // ""),
        (.rate_limits.seven_day.resets_at? // ""),
        (.workspace.current_dir? // .cwd? // ""),
        (.pr.number? // ""),
        (.pr.url? // "")
      ] | map(tostring) | join("\u001f")' 2>/dev/null)

    if [ -n "$parsed" ]; then
        IFS=$'\x1f' read -r MODEL_NAME MODEL_ID SESSION_ID SESSION_COST \
            CONTEXT_TOKENS CONTEXT_LIMIT CONTEXT_USED_PCT \
            USAGE_5H USAGE_7D \
            CACHE_READ CACHE_CREATION \
            WT_NAME WT_BRANCH WT_ORIG_DIR WS_IS_WORKTREE \
            EFFORT_LEVEL FAST_MODE RESET_5H RESET_7D \
            CUR_DIR PR_NUM PR_URL <<< "$parsed"
    fi

    [[ "${SESSION_ID:-}" =~ ^[a-zA-Z0-9_-]+$ ]] || SESSION_ID=""
}

load_state() {
    [[ "$CONTEXT_TOKENS" =~ ^[0-9]+$ ]] || CONTEXT_TOKENS=0
    PREV_TOKENS=0
    CONTEXT_DELTA=0
    # No session id leaves no delta to carry, and a pid-keyed file would sweep on every such
    # render while never being read again.
    [ -n "$SESSION_ID" ] || return

    local cache_dir="${CLAUDE_STATE_DIR:-$HOME/.claude/cache}"
    local state_file="$cache_dir/context-$SESSION_ID.state"

    if [ -f "$state_file" ]; then
        read -r PREV_TOKENS < "$state_file" 2>/dev/null
        [[ "$PREV_TOKENS" =~ ^[0-9]+$ ]] || PREV_TOKENS=0
    else
        mkdir -p "$cache_dir" 2>/dev/null
        # Swept on the session's first render, not on every refresh: the line redraws each
        # minute, and the unconditional write below holds this branch to once per session.
        find "$cache_dir" -name 'context-*.state' -mtime "+$STATE_TTL_DAYS" -delete 2>/dev/null
    fi

    [ "$CONTEXT_TOKENS" -gt 0 ] && CONTEXT_DELTA=$((CONTEXT_TOKENS - PREV_TOKENS))
    printf '%s\n' "$CONTEXT_TOKENS" > "$state_file" 2>/dev/null
}

render_model() {
    if [ -n "$MODEL_NAME" ]; then
        printf '\033[94m%s\033[0m' "$MODEL_NAME"
    elif [ -n "$MODEL_ID" ]; then
        printf '\033[94m%s\033[0m' "$(echo "$MODEL_ID" | sed -E 's/^(claude-)?//; s/-[0-9]{8}$//')"
    else
        return
    fi
    [ -n "$EFFORT_LEVEL" ] && printf ' \033[35m%s\033[0m' "$EFFORT_LEVEL"
    [ -n "$FAST_MODE" ] && printf ' \033[93m[fast]\033[0m'
    RENDERED=1
}

render_context() {
    sep
    if [[ ! "$CONTEXT_USED_PCT" =~ ^[0-9.]+$ ]] || [[ ! "$CONTEXT_LIMIT" =~ ^[1-9][0-9]*$ ]]; then
        printf '\033[32m◔ ready\033[0m'
        return
    fi

    local percentage remaining
    percentage=$(printf "%.0f" "$CONTEXT_USED_PCT")
    remaining=$((100 - percentage))

    local circle color
    if [ "$remaining" -ge 45 ]; then circle="◔"
    elif [ "$remaining" -ge 20 ]; then circle="◑"
    else circle="◕"; fi

    if [ "$percentage" -lt 60 ]; then color='\033[32m'
    elif [ "$percentage" -lt 80 ]; then color='\033[33m'
    else color='\033[31m'; fi

    printf "${color}%s %dk/%dk (%d%%)\033[0m" \
        "$circle" "$((CONTEXT_TOKENS / 1000))" "$((CONTEXT_LIMIT / 1000))" "$percentage"

    local delta_k=$((CONTEXT_DELTA / 1000))
    if [ "$delta_k" -gt 0 ]; then printf ' \033[94m+%dk\033[0m' "$delta_k"
    elif [ "$delta_k" -lt 0 ]; then printf ' \033[35m-%dk\033[0m' "$((-delta_k))"; fi

    [ "$percentage" -ge 80 ] && printf ' \033[31;1m[!]\033[0m'

    render_cache
}

render_cache() {
    [[ "${CACHE_READ:-}" =~ ^[0-9]+$ ]] && [[ "${CACHE_CREATION:-}" =~ ^[0-9]+$ ]] || return
    local total=$((CACHE_READ + CACHE_CREATION))
    [ "$total" -gt 0 ] || return

    local hit_pct=$((CACHE_READ * 100 / total)) color
    if [ "$hit_pct" -ge 80 ]; then color='\033[32m'
    elif [ "$hit_pct" -ge 50 ]; then color='\033[33m'
    else color='\033[31m'; fi

    sep
    printf "${color}cache:%d%%\033[0m" "$hit_pct"
}

render_cost() {
    [ -n "$SESSION_COST" ] && [ "$SESSION_COST" != "0" ] || return
    sep
    printf '\033[33m$%s\033[0m' "$(printf "%.2f" "$SESSION_COST" 2>/dev/null || echo "$SESSION_COST")"
}

reset_eta() {
    [[ "$1" =~ ^[0-9]+$ ]] || return
    local diff=$(( $1 - ${EPOCHSECONDS:-$(date +%s)} ))
    [ "$diff" -le 0 ] && return
    if [ "$diff" -lt 3600 ]; then printf '(%dm)' "$((diff / 60))"
    elif [ "$diff" -lt 86400 ]; then printf '(%dh)' "$((diff / 3600))"
    else printf '(%dd)' "$((diff / 86400))"
    fi
}

render_usage() {
    sep
    [[ "$USAGE_5H" =~ ^[0-9]+$ ]] || { printf '\033[90m5h:- 7d:-\033[0m'; return; }
    local p7=$USAGE_7D
    [[ "$p7" =~ ^[0-9]+$ ]] || p7=0

    printf "$(color_for_pct "$USAGE_5H")5h:%d%%%s\033[0m $(color_for_pct "$p7")7d:%d%%%s\033[0m" \
        "$USAGE_5H" "$(reset_eta "$RESET_5H")" "$p7" "$(reset_eta "$RESET_7D")"
}

# Claude Code supplies the open PR for the current branch as pr.number / pr.url, so
# no `gh pr view` subprocess or TTL cache is needed here.
render_pr() {
    [[ "$PR_NUM" =~ ^[0-9]+$ ]] || return
    printf ' \033]8;;%s\033\\\033[93m[PR#%s]\033[0m\033]8;;\033\\' "$PR_URL" "$PR_NUM"
}

render_git() {
    sep

    if [ -n "$WT_NAME" ]; then
        printf '\033[96;1m%s\033[0m' "$WT_NAME"
        [ -n "$WT_BRANCH" ] && printf ' on \033[95m%s\033[0m' "$WT_BRANCH"
        printf ' \033[92m[wt]\033[0m'
        [ -n "$WT_ORIG_DIR" ] && printf ' \033[90m← %s\033[0m' "${WT_ORIG_DIR:t}"
        render_pr
        return
    fi

    printf '\033[96;1m%s\033[0m' "${${CUR_DIR:-$PWD}:t}"

    local branch
    branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
    [ -z "$branch" ] && return
    printf ' on \033[95m%s\033[0m' "$branch"

    # workspace.git_worktree is populated for any linked worktree, so no git rev-parse
    # fallback is needed to detect one.
    [ -n "${WS_IS_WORKTREE:-}" ] && printf ' \033[92m[wt]\033[0m'

    render_pr
}

parse_stdin
render_model
load_state
render_context
render_cost
render_usage
render_git

# Claude Code hides the status line when the command exits non-zero, and every
# render_* ends in a conditional whose false branch would leak status 1.
exit 0
