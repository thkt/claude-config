---
status: "proposed"
date: 2026-05-07
decision-makers: thkt
consulted: critic-design (DA), advisor
informed: thkt/dotclaude#42, thkt/gates#16, thkt/gates#10
---

# Adopt always-rerun pre-commit gate for silent commit prevention

## Context and Problem Statement

gates plugin runs gates on PostToolUse Write/Edit/MultiEdit. After a fail, agent can run further Write/Edit (overwriting state) or Bash-mediated edits (sed -i / cat > / heredoc, which bypass PostToolUse W/E/M entirely), then `git commit` lands silently. How do we close the silent-commit path while keeping commit latency tolerable?

## Decision Drivers

- Outcome: silent commit recall = 1.0 on direct VCS invocations (preventive)
- No reliance on Bash-mediated edit tracking
- Existing `Bash(*--no-verify*)` deny covers one bypass; commit detection must cover the rest
- Bash hook chain budget: pre-commit must not stall non-commit Bash

## Considered Options

- A. Always-rerun pre-commit gate in gates plugin (chosen)
- B. Hybrid cache (60s fresh window, stale triggers sync re-run)
- C. New `closure` sentinel plugin owning pre-commit + Stop diagnostic
- D. shields-only intercept (extend shields to delegate to gates on `git commit`)

## Decision Outcome

Chosen option: A. Three load-bearing sub-decisions:

1. Always-rerun, no cache. gates measured 3.3s on a real TS monorepo (okr-dashboard). Bash-mediated edits bypass PostToolUse hooks, so any cache freshness window leaks the silent-commit path option B tried to optimise.
2. Extend gates plugin, no closure split. gates already owns gate state; placing pre-commit phase in the same binary keeps responsibility cohesive. Closure split deferred to a reassessment trigger.
3. VCS-aware enumeration. Detection covers `git`, `jj`, `hg` commands that produce commits. Aliases, heredocs, `gh pr merge` (server-side) are out of scope for Phase 1; deferred to a Phase 2 diagnostic Stop hook.

### Consequences

- Good, because silent commit recall = 1.0 on direct invocations of enumerated VCS commands.
- Good, because zero cache, zero atomic-write race, zero cross-repo project_hash logic.
- Bad, because 3-30s synchronous block on every commit (acceptable; commits are infrequent vs edits).
- Bad, because aliases, heredocs, and `gh pr merge` are not preventively blocked (Phase 2 diagnostic only).

### Confirmation

- AC: `git commit`, `jj commit`, `hg commit` synchronously invoke gates and block on fail.
- AC: non-commit Bash exits the hook in <50ms (fast-path).
- AC: `gates run` (default subcommand) remains backward-compatible.
- AC: PreToolUse Bash timeout 70000ms accommodates worst-case gates run.

## Pros and Cons of the Options

### A. Always-rerun in gates plugin (chosen)

- Good, because zero state, zero cache invalidation logic.
- Good, because closes Bash-mediated-edit silent path by construction.
- Bad, because every commit pays 3-30s gate run.

### B. Hybrid cache

- Good, because cache-hit commits are zero-latency.
- Bad, because Bash-mediated edits write to disk without invalidating cache, violating recall=1.0 (advisor + DA F1).
- Bad, because cache atomicity, cross-repo project_hash, session_id race all add complexity (DA F4/F5/F7).

### C. New `closure` sentinel plugin

- Good, because clean separation of test-gate vs commit-lifecycle responsibilities.
- Bad, because doubles initial cost (new repo, crate, plugin manifest, marketplace entry).
- Bad, because cross-binary subprocess latency on every Bash hook.

### D. shields-only intercept

- Bad, because shields concerns are command guard + secrets, not test gating (mission creep).
- Bad, because cross-binary chaining adds latency without architectural benefit.

## More Information

### Architecture Diagram

```text
PreToolUse Bash (NEW)
  └── gates pre-commit
        ├── HookInput parse (stdin)
        ├── VCS-aware command match (git/jj/hg)
        ├── repo scope (-C parse + cwd fallback)
        └── if match → gates run (sync) → block on fail
              else → exit 0 (fast-path)

PostToolUse W|E|M (existing, unchanged)
  └── gates run
```

### Reassessment Triggers

- gates run time exceeds 30s on common repos → reconsider hybrid cache with mtime-based invalidation.
- Aliases or heredoc bypass becomes frequent → migrate detection to closure with command-tree introspection.
- gates plugin scope expands beyond commit gating (e.g., session-end audit) → split closure as a sibling sentinel.
- Phase 2 diagnostic Stop hook reveals shared infra with #16 (hash gate) → consolidate pre-commit phase abstraction.

### References

- Issue: thkt/dotclaude#42 (harness-level tracker)
- Related: thkt/gates#16 (pre-commit hash gate, shares pre-commit phase infra)
- Related: thkt/gates#10 (audit log, candidate Phase 2 storage)
- Research: ~/.claude/workspace/research/2026-05-07-knowledge-reflection-cache-safe-design.md
- Memory: project_harness-investigation-quality.md ("biggest gap" record)
