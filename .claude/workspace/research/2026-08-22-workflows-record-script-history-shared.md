# Research: workflows-record-script-history-shared

Generated: 2026-08-22
Session: d7df9978-60c2-45d9-89a7-25411a81a9ef
Intent: Feature planning
Domain: General
Prior research: none found

## Purpose

Decide whether `workflows/build/record.py`, `workflows/audit/snapshot.py`, and the recording issue #424 asks assert to add should share code. Establish how many scripts write to `~/.claude/history/`, what precedent and placement convention this repository has for shared Python, and what the extraction would cost.

## Key Findings

| Priority | Finding | Source | Next Action |
| -------- | ------- | ------- | ----------- |
| High | Exactly two scripts write to `~/.claude/history/`: `record.py` appends `build-runs.jsonl`, `snapshot.py` writes one `audit-<ts>.json` per run. No third writer exists in Python, JS, or shell. | `workflows/build/record.py:25,27`; `workflows/audit/snapshot.py:28,97`; three-method sweep in Disconfirmation Check | Answers the "how many scripts" half of the question. Record only. |
| High | The two write strategies diverge by explicit design, not by accident. `record.py:26` states it: "One fixed file, not audit's file per run: counting then reads a single jsonl." | `workflows/build/record.py:26` | Answers "should they be unified". Under CLAUDE.md's DRY rule ("each copy could evolve independently → merely similar code, do not merge") the write half must stay separate. Record only. |
| High | The identical overlap is 25 non-blank lines out of 177 total across both files, and most of it is imports and `if __name__`. The shareable logic is roughly 16 lines: `fail()`, the stdin parse-and-validate block, `HISTORY_DIR` + `mkdir`, and the `generated_at` strftime. | `comm -12` over both files (CMD 14 in the scratch); `wc -l workflows/build/record.py workflows/audit/snapshot.py` → 73 + 104 | Sizes the gain against the cost. Record only. |
| High | The two scripts already differ in call shape by a recorded decision. Issue #386's Plan states build took a "relay type (agent is plumbing, script decides)" instead of audit's "snapshot type (agent builds the payload)", while keeping audit's `HISTORY_DIR` and stdin conventions. | `gh issue view 386` § reference_module: "呼び出しは audit の snapshot 型 (agent が payload を組む) でなく relay 型 (agent は配管、script が決める) を採る" | A shared module can carry only the conventions both kept (path, stdin, exit code), not the call shape. Record only. |
| High | Issue #424 is the live driver and it already names the target: append one line per assert run to `~/.claude/history/assert-runs.jsonl`, "作りは #386 の `workflows/build/record.py` に倣う". It is the assert-side shape of `record.py`, not of `snapshot.py`. | `gh issue view 424` § Proposed solution | Feeds `/think`. `record.py` and the new `assert-runs.jsonl` writer are the pair holding real shared knowledge, not `record.py` and `snapshot.py`. Two jsonl-append writers meet the YAGNI Boundary gate (call sites >= 2), so the recommendation is to share between those two |
| High | `assert.js` writes nothing to disk today. It returns `{gate, gate_reason, mode, build, tests, issues, root_causes, adversarial, outcome_ref, report}` and stops there. | `workflows/assert.js:624-634`; grep for `snapshot\|record\|history\|jsonl\|run_id` over `workflows/assert.js` returns only line 255, an unrelated prose line | Confirms #424's premise ("返り値は会話に出るだけで、どこにも残らない"). Record only. |
| High | `~/.claude/history/` has no in-repo code reader, but it does have a human reader. #386's Backlog candidates says "記録を読む集計コマンドの CLI 化。当面は jq で足りる", and #424's Acceptance Criteria requires counting runs from the written rows. | `gh issue view 386` § Backlog candidates; `gh issue view 424` § Acceptance Criteria; DR-0099:47 "`~/.claude/history/` loses its only reader and becomes write-only" | DR-0099's "write-only" means no code reader. The design reader is `jq` run by thkt. That is what makes a stable, greppable row schema the thing worth sharing. Feeds `/think`. |
| Medium | The placement convention is three-tiered and every tier has a precedent in this repository. | See Available Data § Convention rows | Answers "python の共有コードの前例と置き場の規約". Record only. |
| Medium | `workflows/_lib/` holds only `run-workflow.js`. There is no Python there, and `.ja/workflows/_lib/` does not exist at all. | `find workflows/_lib -type f`; `find .ja/workflows -type f` | Names the concrete new-directory cost. Feeds `/think`. |
| Medium | DR-0096 already faced this exact judgment for JS and declined. Its Option C was "`fenced()` を `workflows/_lib/` の共有 helper として切り出し", rejected because "対象が audit.js 内の 4 呼び出しに留まる現状では見合わない", and it recorded that `.ja/workflows/_lib/` would need creating and syncing. | `docs/decisions/0096-fence-untrusted-findings-in-four-audit-stages.md:28,32` | A precedent for the judgment pattern and a cost inventory, not a rule that forbids extraction. Its Reassessment Triggers (line 65) are about `fenced()` and a second LLM-output stage, so they are neither met nor on point here. Record only. |
| Medium | Obstacle: the `.ja/` mirror doubles every file. `.ja/` is canonical (ADR-0073, MIRROR.md), a `.py` file is a prose-translation target, and the English side must be mirrored in the same commit. A shared module means two new module files plus one new directory on each side. | `hooks/_lib/mirror_prose.py:22` (`TARGET_SUFFIXES` includes `.py`); `rules/conventions/MIRROR.md` § Canonical side and mirroring | Record only. |
| Medium | Obstacle: the cross-directory import form costs a `sys.path.insert` plus `# noqa: E402` at each import site, because ruff's `E` rules run over the whole tree including `.ja/`. | `workflows/build/tests/revalidate_test.py:25,27` shows the exact form; `.github/workflows/test.yml:72` runs `ruff check .`; `ruff.toml` selects `E` | Record only. |
| Low | Non-obstacle: the plugin distribution clones the whole repository, so a `__file__`-relative `_lib` sibling resolves in both the dev tree and an installed plugin. `bundled()` resolves a path under `$HOME/.claude` first and falls back to `$HOME/.claude/plugins`, excluding `*/.ja/*`. | `.claude-plugin/marketplace.json` metadata: "Installing build clones the whole repository once"; `workflows/build.js:164-165` | Removes one candidate blocker. Record only. |
| Medium | The test files duplicate more than the scripts do. `record_test.py` (147 lines) and `snapshot_test.py` (163 lines) share the same `subprocess.run` + `TemporaryDirectory` + `env = {"HOME": ..., "PATH": ""}` harness and the same `test_unparseable_payload_exits_1_and_writes_nothing` case. | `comm -12` over both test files (CMD in scratch); `workflows/build/tests/record_test.py:8`; `workflows/audit/tests/snapshot_test.py` | Feeds `/think`. This is a stronger extraction candidate than either script: a third recorder makes it a three-way copy, and #424's Testing Decisions already commits the assert tests to `record_test.py`'s form |
| Low | CI picks up a new shared module's tests automatically. Python tests run via `find agents hooks skills workflows -name '*_test.py'`, so `workflows/_lib/tests/*_test.py` is discovered with no config change. | `.github/workflows/test.yml:53` | Record only. |
| Low | The history directory holds 528 files: 113 `audit-*.json`, older `audit-*.yaml`, and a `build-runs.jsonl` of 3 lines. | `ls ~/.claude/history/ \| wc -l`; `ls ~/.claude/history/audit-*.json \| wc -l`; `wc -l ~/.claude/history/build-runs.jsonl` | The build recorder is new enough that its row schema is still cheap to change. Record only. |

## Available Data

| Type | Item | Note |
| ---- | ---- | ---- |
| File | `workflows/build/record.py` (73 lines) | stdin JSON → one appended line in `build-runs.jsonl`; stdout `{path, run_id}`; mints `run_id` (uuid4) and `generated_at` |
| File | `workflows/audit/snapshot.py` (104 lines) | stdin JSON → one `audit-<ts>.json` per run; stdout `{path, counts}`; resolves `branch` via `git rev-parse` and counts 5 arrays |
| File | `workflows/assert/bootstrap.py`, `workflows/assert/worktree.py` | Take argv, not stdin JSON. Neither writes to history. Different contract shape from the two recorders |
| Convention | Same-directory sharing → bare sibling import | `skills/dr/scripts/dr_common.py`, imported as `from dr_common import fail, ...` by `pre-check.py:15`, `validate-dr.py:16`, `update-index.py:15`. Works because `sys.path[0]` is the script's own directory |
| Convention | Cross-directory sharing within one tree → `<tree>/_lib/` + `sys.path.insert(0, parents[1] / "_lib")` | `hooks/_lib/` holds 7 modules; 12 importers use the identical one-line form (`hooks/pre-bash/*.py`, `hooks/security/*.py`, `hooks/edit/*.py`, `hooks/lifecycle/recall_index.py`) |
| Convention | Shared CLI rather than an imported module → `skills/_lib/<name>.py`, invoked by path from prose | `skills/_lib/review_score.py` + `skills/_lib/review-harness.md:13`, which tells the caller to run `python3 skills/_lib/review_score.py ...` |
| Convention | Record destination | `~/.claude/history/` for cross-project run records, `.claude/workspace/` for work products (DR-0090) |
| Config | `ruff.toml` | `line-length = 100`; `E`/`W`/`F`/`I`/`UP`/`B`/`SIM`/`C4`/`RET`/`PTH`/`ARG`/`RUF` selected; per-file `E501` ignores exist for both `workflows/build/pr-body.py` and its `.ja/` twin |
| Env | Python test discovery | `find agents hooks skills workflows -name '*_test.py' -print0 \| xargs -0 -r -n1 python3` (`.github/workflows/test.yml:53`). Not unittest discovery, and `.ja/` is not in the search roots |

## Constraints

| Category | Constraint |
| -------- | ---------- |
| OUTCOME | Quality assurance moves from LLM discretion into a deterministic layer; thkt reviews only the residue. A record with no reader does not advance this, so any recording work must keep the `jq` query path usable |
| OUTCOME (Constraints) | `.ja/` is canonical; the English side mirrors in the same commit (ADR-0073). Any new shared module ships as two files |
| Repository | `.py` is a prose-translation target for the mirror, so the module body's comments and docstrings differ between the two sides while the code stays identical (`hooks/_lib/mirror_prose.py:22`, MIRROR.md § Mirroring form) |
| Repository | Code under `.ja/` never runs. `bundled()` excludes `*/.ja/*` (`workflows/build.js:165`) and CI's Python roots exclude `.ja/` |
| Repository | Both recorders are launched by an agent through a shell fragment (`python3 <bundled path> < <tempfile>`), not by the JS runtime (`workflows/build.js:92`, `workflows/audit.js:155`). An import must therefore resolve from `__file__`, not from cwd |
| Design (DR-0104) | Neither severity nor disposition gates audit. #424 exists to gather the counts DR-0104's reassessment condition needs, so the assert row must carry per-severity issue counts |

## Disconfirmation Check

The load-bearing exhaustiveness claim is "exactly two scripts write to `~/.claude/history/`". Verified with three independent methods; all three agree.

Method 1 — grep with no `--include` filter, so every file type is in scope:

```
$ grep -rn "\.claude/history\|/history/" . | grep -v "/node_modules/\|\.git/\|/plugins/marketplaces/\|__pycache__"
workflows/audit/snapshot.py:3:Record one audit run to $HOME/.claude/history/.
workflows/audit/snapshot.py:28:HISTORY_DIR = Path.home() / ".claude" / "history"
workflows/build/record.py:3:Append one build run to $HOME/.claude/history/build-runs.jsonl.
workflows/build/record.py:25:HISTORY_DIR = Path.home() / ".claude" / "history"
workflows/audit.js:157:        `$HOME/.claude/history/, and prints one line of JSON, {path, counts}, to stdout. ` +
workflows/audit/tests/audit.seam.test.js:20:// snapshot.py's HISTORY_DIR derives from $HOME/.claude/history (see snapshot.py). Each test
workflows/build/tests/record_test.py:135,143 (assertions that nothing was written)
workflows/build/tests/build.behavior.test.js:105,1433 (a stub path and a read-back assertion)
skills/fix/tests/finding-routing.test.js:17: // resolving one against ~/.claude/history/ matched nothing.
docs/COMMANDS.md:71, docs/decisions/{0044,0081,0090,0099}*.md (documentation)
```

Every hit that is not `snapshot.py` or `record.py` is a test, a prompt string, or a document. `skills/fix/tests/finding-routing.test.js:21` asserts the opposite of a read: `assert.doesNotMatch(doc, /history\//, ...)`.

Method 2 — Python-wide `Path.home()` sweep, which would catch a writer that spells the path differently:

```
$ grep -rn "Path.home()" --include="*.py" . | grep -v "/\.ja/\|/node_modules/\|/plugins/marketplaces/"
workflows/audit/snapshot.py:28:HISTORY_DIR = Path.home() / ".claude" / "history"
workflows/build/record.py:25:HISTORY_DIR = Path.home() / ".claude" / "history"
workflows/build/pr-body.py:103:        with (Path.home() / ".claude" / "settings.json").open() as f:
hooks/pre-bash/client_identifier_gate.py:33:    or Path.home() / ".config" / "claude" / "client-names.txt"
hooks/security/git_sandbox_guard.py:162:    named = os.environ.get("CLAUDE_CONFIG_DIR") or str(Path.home() / ".claude")
hooks/security/npm_install_guard.py:123:    return project if project is not None else bool(_setting(Path.home() / ".npmrc"))
hooks/lifecycle/recall_index.py:39:    return Path.home() / ".cache" / "claude-recall_index.last"
hooks/integrations/amphetamine_agent_session.py:40:DEFAULT_STATE_DIR = Path.home() / "Library" / ...
```

The five non-history hits target `settings.json`, `.config/`, `.npmrc`, `.cache/`, and `Library/`. No third history writer.

Method 3 — ugrep across `.py`, `.sh`, `.zsh`, `.ts`, `.js`, which adds the shell lane the first two greps could not fully cover. It returned the same two scripts plus `audit.js` prompt strings and five cached copies of `audit.js` under `projects/`, which are Claude Code session snapshots of the same file rather than separate writers.

The shell lane returned zero:

```
$ grep -rn "history" --include='*.sh' --include='*.zsh' . | grep -v node_modules | grep -v marketplaces
(no output)
```

Round-tripping that zero against a value known to match, per verification.md § Reading a zero-result:

```
$ grep -rn "claude" --include='*.sh' hooks/ | wc -l
7
$ grep -rn "history" --include='*.sh' hooks/ | wc -l
0
```

The query shape finds matches when matches exist, so the zero is absence rather than a misshapen query.

Near-miss worth naming: DR-0068 discusses a zsh script that appends JSONL from `history.jsonl`. That is Claude Code's own session transcript, not `~/.claude/history/`, and that script is not in this repository.

## References

| Path | Description |
| ---- | ----------- |
| `docs/decisions/0090-unify-workspace-and-history-storage-locations.md` | Fixes `~/.claude/history/` as the `$HOME`-anchored cross-project record location, separate from `.claude/workspace/` |
| `docs/decisions/0096-fence-untrusted-findings-in-four-audit-stages.md` | The precedent judgment declining a `workflows/_lib/` extraction (Option C) and naming the `.ja/workflows/_lib/` cost |
| `docs/decisions/0099-retire-fix-finding-id-route-for-direct-finding-input.md` | Removed the only code reader of the history directory; its reassessment trigger is "a second **consumer**", not a third writer |
| `docs/decisions/0104-keep-disposition-out-of-audit-gates.md` | The reassessment condition #424 exists to gather evidence for |
| Issue #424 (open) | assert gate recording; proposes `~/.claude/history/assert-runs.jsonl` following `record.py` |
| Issue #386 (closed) | build run recording; its Plan holds the relay-vs-snapshot call-shape decision and the `record.py` unit contract |
| Issue #343 (open) | Counting anomaly frequency from existing build/code records; a second human-side reader of the same data |
| `/private/tmp/claude/claude-501/-Users-thkt--claude/d7df9978-60c2-45d9-89a7-25411a81a9ef/scratchpad/audit-trail.txt` | Phase 4 audit trail: 22 commands with raw output |

## Coverage Notes

- Unknown: whether any tooling outside this repository reads `~/.claude/history/`. The directory is `$HOME`-anchored and cross-project by design (DR-0090:29), so a reader could live elsewhere on this machine. `unknown, requires confirming with thkt whether any out-of-repo script or dashboard reads ~/.claude/history/`. If one exists, the valuable unification is the row schema so a single reader parses every recorder; if none, the in-repo evidence (#386 Backlog, #424 AC) says the reader is ad-hoc `jq` and a stable key set is enough.
- Unknown: whether #424's assert row should carry `run_id` at all. `record.py` mints one so a stop row joins its start row (`record.py:8-9,14`), but assert has no two-phase start/stop shape in `assert.js:624-634`. `unknown, requires deciding in /think whether assert records once per run or at start and end`.
- No tool disagreement. All three exhaustiveness methods returned the same two writers.
- No external claims; every finding cites a file in this repository or a `gh issue view` of this repository's issue tracker.
- Advisor: invoked pre-synthesis. It flagged the missing audit trail (written before synthesis), the untested shell lane in the exhaustiveness claim (closed with a third method and a zero-result round-trip), the unfiltered reader grep (run), and the out-of-repo reader as unknowable from here (recorded above). Its framing that both writers are write-only was corrected by primary evidence found afterwards: #386's Backlog candidates and #424's Acceptance Criteria both name `jq` counting as the intended read path.
- The `explorer-feature` spawn for the assert side did not return before synthesis. Its five questions were answered directly instead, from `workflows/assert.js:255,624-634`, the docstrings of `workflows/assert/bootstrap.py` and `workflows/assert/worktree.py`, and `gh issue view 424`.

## Next Steps

| Intent | Next Command |
| ------ | ------------ |
| Feature planning | `/think` |
