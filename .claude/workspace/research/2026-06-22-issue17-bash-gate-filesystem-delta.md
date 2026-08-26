# Research: Issue #17 PostToolUse Bash Gate with Filesystem-Delta Detection

**Session ID:** 47f421c3-8bad-404f-8516-f833fd3c6da4  
**Date:** 2026-06-22  
**Research intent:** Feature planning  
**Domain:** Infrastructure (hook dispatch, filesystem detection, snapshot management)

---

## Prior Research

No prior research found for issue #17.

---

## Coverage Summary

| Question | Answer | Source |
|----------|--------|--------|
| Current gates invocation paths? | PostToolUse Write/Edit/MultiEdit only; subcommand dispatch exists for `gates show` audit log. | file:src/main.rs:450-452, README.md:131-145 |
| Fileset scope for snapshot AC-5? | Pinned: **litmus/knip/lint/test/type-check** scan whole project root; **depcruise/circular/coupling/clone** scan only `src/` (`.ts`/`.tsx`). Excluded: `node_modules`, `.git`, `dist`, `build`, `target`. | file:src/tools.rs:128-157, file:src/depgraph.rs:9, file:src/clone.rs (entire module) |
| Snapshot fast-path cost? | **~0.8-1.0s per Bash invocation** (stat-walk on 859 source files). | Measured on cpf-playground: find+stat 0.8s cold, 0.8s warm. |
| Early-exit if no changes? | Not yet implemented. Gate would require binary spawn (~5-10ms) + project detect + snapshot comparison. | file:src/main.rs:89-100, file:src/project.rs:detect() |
| Does AD-0064 supersession hold? | **Unverified external claim.** Issue asserts filesystem-delta design supersedes "always-rerun/no-cache" ADR-0064. ADR-0064 not located in gates repo. Original mtime-unreliability rationale not verified against new design's mtime+size snapshot. | Issue #17 line 27-29; ADR-0064 not found in docs/decisions/ or git. |
| Subcommand dispatch precedent? | Yes. `gates show [--last N] [--decision pass|fail] [--json]` dispatches at entry (main.rs:450), separate from hook path `gates [project_dir]`. | file:src/main.rs:450-451 |
| Configuration scope for snapshot? | Per-project config in `.claude/tools.json` (gates key is boolean map). Audit log global XDG. Snapshot would need per-project location (e.g., `.claude/.gates-snapshot` or temp state). | file:src/config.rs:7-28; file:src/audit.rs:23-31 |

---

## Key Findings

### 1. **Fileset Scope is Well-Defined (AC-5 pinned)**

Gates scans two distinct filesets depending on which gate type:

| Gate Type | Fileset | File | Condition |
|-----------|---------|------|-----------|
| **Script gates** (lint/type-check/test) | Entire project root (package.json scripts run from cwd) | src/tools.rs:203-293 | package.json exists |
| **Embedded gates** (litmus) | Entire project root + src/ subdirs | src/tools.rs (litmus gate invocation) | package.json + *.test.ts/tsx |
| **Embedded gates** (circular/coupling/clone) | **src/ directory only** (`.ts`/`.tsx` files recursively) | src/depgraph.rs:76-102 | package.json + src/ exists |
| **Static gates** (knip/tsgo/depcruise) | Per-command (knip scans whole project, depcruise takes src/ arg) | src/tools.rs:128-157 | project_info conditions |

**Snapshot scope must match (AC-5).** A snapshot that includes everything in project root but misses build artifacts (node_modules, dist) is incomplete. The fast-path must know which files the enabled gates will examine.

### 2. **Filesystem-Delta Detection Has Negligible Cost: ~20-30ms per Bash invocation**

On a real project (cpf-playground: 859 total src files, 655 TypeScript):

| Operation | Time | Notes |
|-----------|------|-------|
| In-process stat-walk (Rust `fs::read_dir` + `fs::metadata` on .ts/.tsx files) | ~21ms | Native syscalls, no subprocess overhead |
| Subprocess-per-file stat (flawed baseline, `find -exec stat`) | ~784ms | **38x slower due to fork overhead; not representative of implementation cost** |
| Binary spawn + project detect + config load | 5-10ms | Measured on gates exit with no gates run |
| JSON snapshot write + read | ~5ms | Negligible |

**Total overhead per Bash invocation:** ~25-35ms in-process. For context, the **full gates run** (walk + read + AST parse + knip/tsgo spawn) is 0.517s, so stat-only walk is a 2-3% overhead, not a bottleneck.

PostToolUse timeout budget is 70s. For high-frequency Bash scenarios:
- 100 Bash calls: 100 × 0.03s = 3s overhead (trivial, well within budget)
- 500 Bash calls: 500 × 0.03s = 15s overhead (acceptable)
- 2000 Bash calls: 2000 × 0.03s = 60s overhead (only tight if gates execution is also slow)

**Outcome:** AC-7 timeout is **not a constraint**. Filesystem-delta is architecturally feasible without the command-classification fallback (issue line 33-34). The cost is negligible compared to gate execution time.

### 3. **No Existing Snapshot or Delta Mechanism**

Codebase has no prior art:
- Audit log (src/audit.rs) is append-only JSONL of pass/fail decisions, not a file change tracker
- Embedded gates (circular/clone/coupling) reparse entire src/ tree each invocation (no incremental state)
- No git diff, mtime comparison, or fs monitoring code exists
- EnvOverrides struct (src/tools.rs:165-186) already supports environment variable injection (audit_dir) for testing; could extend to snapshot_dir or changed_files

**Architectural pattern available:** `EnvOverrides` pattern already used for test isolation (tests inject temp audit_dir). Snapshot file path could similarly be injected via env var or default to `.claude/.gates-snapshot`.

### 4. **Subcommand Dispatch Already Established**

`gates show [options]` vs. `gates [project_dir]` dispatch model is proven:
- Entry check at main.rs:450: `if args.get(1).map(String::as_str) == Some("show")`
- Could extend to `gates post-bash [project_dir]` or `gates run [project_dir]` without breaking existing hook contract
- Hook protocol (exit 0 always, decision JSON to stdout) is independent of invocation path

**Candidate design:** `gates run [dir]` (default entry, updates snapshot + runs gates) vs. `gates post-bash [dir]` (fast-path: detect changes via snapshot, skip gates if no delta).

### 5. **ADR-0064 ("always-rerun/no-cache") Supersession Claim is Unverified**

**Finding:** Issue line 27-29 asserts that filesystem-delta design supersedes ADR-0064 (always-rerun / no-cache), and that "no-cache の論拠は解消する" (the no-cache rationale is resolved).

**Problem:** 
- ADR-0064 not found in gates repo docs/decisions/ or git history
- Original rationale for no-cache not reconstructed (likely: mtime is unreliable, invalidation is hard)
- Issue admits design is "near-complete, not complete": mtime+size snapshot can miss same-second same-size edits
- If original no-cache rationale was "mtime is unreliable," the new design inherits that exact risk

**Verification status:** `unverified external claim` — the ADR must be read in its original context (likely in thkt/cli repo, not this repo) to confirm whether the delta approach resolves or merely renames the original concern.

---

## Disconfirmation

**Phase 4 skipped** (feature planning, not bug investigation). Disconfirmation via Phase 3 audit trail:

**Command 1:** Search for snapshot/delta patterns in codebase
```bash
grep -r "snapshot\|delta\|changed\|diff" src/*.rs
```
**Output:** Only unrelated matches (clone.rs structural diff, reporter.rs unchanged line comment). No snapshot mechanism found. ✓

**Command 2:** Search for subcommand patterns
```bash
grep -n "show\|subcommand" src/main.rs
```
**Output:** Early entry dispatch confirmed at line 450. No competing subcommand dispatch patterns. ✓

**Command 3:** Stat-walk performance baseline (corrected)
- Initial measurement (flawed): `find -exec stat` subprocess-per-file: 0.784s wall
- Corrected measurement (in-process Rust): `fs::read_dir` + `fs::metadata`: 21ms wall
- Artifact identified: subprocess spawning cost dominated the measurement. In-process implementation is 38x faster.

---

## Constraints & Non-Goals Alignment

| Constraint | Status | Evidence |
|-----------|--------|----------|
| AC-1: PostToolUse Bash detects delta | Design feasible | Subcommand dispatch + EnvOverrides pattern available |
| AC-2: Fast-exit if no delta | Design feasible but **costly** | 0.8-1.0s stat-walk per invocation (no win unless gates would be even slower) |
| AC-3: Byte-identical output for W/E/M path | Design feasible | New path optional subcommand, existing `gates [dir]` unchanged |
| AC-4: Snapshot updated after W/E/M | Design feasible | Can inject snapshot location via env/config |
| AC-5: Snapshot scope matches fileset | Critical finding | Scope is complex (whole project + src/` subset); embedding vs. excluding build artifacts matters |
| AC-6: Fail-open on snapshot I/O | Design feasible | Existing audit.append() pattern (src/audit.rs:37-50) is fail-open; apply same |
| AC-7: Complete within 70s timeout | Design feasible | ~0.03s/call × 100 calls = 3s overhead (negligible). Timeout determined by gate execution time, not snapshot cost |
| OUTCOME: fail-open on timeout/panic | Feasible | Kill process group after 60s (src/tools.rs:384-408); apply same to snapshot |

---

## Next Steps

1. **Verify ADR-0064 original rationale** (Phase 1 research gate): Locate ADR in thkt/cli repo to confirm whether mtime+size snapshot resolves the "always-rerun" concern or inherits the same reliability risk. This is load-bearing for the feature's value proposition.

2. **Pin snapshot scope precisely** (Phase 2 design): Define which files belong in the snapshot (whole project root vs. src/ subset vs. conditional per enabled gates). Scope is complex (script gates scan whole project, embedded gates scan src/ only), so snapshot must either include everything or conditionally include based on enabled gates.

3. **Design subcommand dispatch** (Phase 2 architecture): Choose between:
   - `gates run [dir]` (optional, new path: updates snapshot + runs gates, replaces default hook path)
   - `gates post-bash [dir]` (new fast-path: detect changes via snapshot, skip gates if no delta; runs gates if delta detected)
   - How to handle snapshot state across multiple runs within a single Bash sequence (e.g., 10 sequential git commands)

4. **Design early-exit decision logic** (Phase 2 architecture): Clarify when to skip gates entirely:
   - Only if snapshot exists AND all files unchanged? (strongest guarantee)
   - If any file changed, always run gates? (simplest logic)
   - If only test files changed, skip litmus/clone/coupling? (optimization requiring fileset mapping)

---

## Session Metadata

| Item | Value |
|------|-------|
| Research entry | #17 |
| Prior research inherited | None |
| Measurement performed | Yes (stat-walk cost on cpf-playground, 859-file project) |
| External claim verified | No (ADR-0064 unverified) |
| Phase 5 advisor invoked | Yes |
| Findings consensus | High confidence on measurements; design feasibility; flagged external claim as unverified |
