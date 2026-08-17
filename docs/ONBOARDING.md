# Welcome to [Team Name]

## How We Use Claude

Measured on 2026-08-17, by counting `<command-name>` occurrences across the 6018 session logs touched in the last 30 days.

Top Skills & Commands:
/clear ████████████████████ 111
/build █████░░░░░░░░░░░░░░░ 28
/qualify ████░░░░░░░░░░░░░░░░ 23
/polish ████░░░░░░░░░░░░░░░░ 21
/model ███░░░░░░░░░░░░░░░░░ 14
/compact ███░░░░░░░░░░░░░░░░░ 14
/exit ██░░░░░░░░░░░░░░░░░░ 10
/issue ██░░░░░░░░░░░░░░░░░░ 9
/think █░░░░░░░░░░░░░░░░░░░ 8
/code-review █░░░░░░░░░░░░░░░░░░░ 6
/audit █░░░░░░░░░░░░░░░░░░░ 6
/assert █░░░░░░░░░░░░░░░░░░░ 6
/adrift █░░░░░░░░░░░░░░░░░░░ 6

MCP Servers: zero calls over the same window.

## Your Setup Checklist

### Codebases

- [ ] dotclaude - github.com/thkt/dotclaude (Claude Code config: agents, skills, hooks, rules)
- [ ] scout - ~/GitHub/cli/scout (web fetch / search CLI)
- [ ] recall - ~/GitHub/cli/recall (session search)
- [ ] shields - ~/GitHub/cli/shields (PreToolUse guard hook; currently unwired in settings.json)
- [ ] guardrails - ~/GitHub/cli/guardrails (lint hook)
- [ ] kiku - ~/GitHub/cli/kiku (Slack semantic search)
- [ ] kagami - ~/GitHub/apps/kagami (session tracking app)
- [ ] tally - ~/GitHub/cli/tally (engineering time tracking)

### CLI Tools to Install

- [ ] scout - Web search, page fetch, GitHub repo exploration, Slack fetch. `brew install thkt/tap/scout`
- [ ] recall - Full-text search across past sessions. `brew install thkt/tap/recall`
- [ ] codegraph - Symbol-level structure queries. `npm i -g @colbymchenry/codegraph`, then `codegraph init` per repository
- [ ] gh - GitHub API access. `brew install gh && gh auth login`

### Skills to Know About

- `/build` - Implements a plan-backed issue end-to-end and opens a draft PR. The most-used entry point.
- `/qualify` - Checks whether an issue is ready to hand to build. Run it before launching build.
- `/polish` - External-lens (Codex) review and cleanup. Use after a feature lands to catch slop.
- `/issue` - Files a GitHub Issue with a structured title and body; transfers a plan into the `## Plan` section when one exists.
- `/think` - Design exploration that produces a plan (transferred to the issue's Plan section). Entry point for any non-trivial new feature.
- `/audit` - Fans specialized reviewers (security, type safety, silent failures, etc.) out over a diff.
- `/assert` - Independent merge-readiness verdict, running Codex in an isolated worktree.
- `/adrift` - Scans for drift between DRs and the current code.
- `/commit` - Generates a Conventional Commits message from the staged diff. Run after edits instead of writing them manually.
- `/challenge` - Devil's advocate pass on a proposal, design, or plan. Use before committing to an architecture decision.
- `/compact` - Summarizes and compresses context when usage approaches 70%. Run proactively on long sessions.

## Team Tips

_TODO_

## Get Started

_TODO_

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy - warm, conversational,
not lecture-y.

Open with a warm welcome - include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes - [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections - offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data - don't extrapolate them into a "team
workflow" narrative. -->
