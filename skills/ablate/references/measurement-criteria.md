# /ablate measurement criteria

Used by Phase 2 to build each element's observation and by `verdict.classify` in
`${CLAUDE_SKILL_DIR}/scripts/verdict.py` to score it. The run count, pass threshold, and arm
list stay script constants in `${CLAUDE_SKILL_DIR}/scripts/arms.py`; a copy of a number here
goes stale on the next edit to that file with nothing to catch it
(`docs/wiki/deterministic-script-judgment.md`).

## Why a fixed task set

A rule that never fires during a run leaves nothing to compare between arms:
`verdict.classify` returns `unmeasured` whenever an element's own triggering task is absent
from the run's task set, before it looks at compliance at all. Phase 2 draws every
`trigger_task` from the table below instead of inventing one per run, so two ablation runs
measuring the same rule start from the same task and stay comparable.

## Rule to triggering task

`always-loaded` carries no path or glob condition of its own, so the task below is the only
thing that makes a run exercise it. `path-triggered` already names its own condition in its
`paths:` frontmatter; the task below names one concrete file shape that condition matches.

| Rule                                  | Classification | Trigger task ID     | Task                                                                                                      |
| ------------------------------------- | -------------- | ------------------- | --------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                           | always-loaded  | `T-scope-choice`    | A task that requires choosing between tool, structure, scope, or process options before starting          |
| `rules/PRINCIPLES.md`                 | always-loaded  | `T-reuse-check`     | An implementation task where an existing helper, util, or pattern in the codebase already covers the need |
| `rules/conventions/MIRROR.md`         | always-loaded  | `T-ja-mirror`       | Edit a file under `.ja/` and update its English mirror in the same change                                 |
| `rules/conventions/PROSE.md`          | always-loaded  | `T-vague-prose`     | Write or revise prose in an LLM-facing file that carries a vague term such as correct or normal           |
| `rules/core/BOUNDARIES.md`            | always-loaded  | `T-enhance-early`   | Add error handling or performance work before the basic path is confirmed working                         |
| `rules/core/OPERATION.md`             | always-loaded  | `T-sandbox-op`      | A bash command that writes a temp file, runs in the background, or touches a sandbox-restricted path      |
| `rules/core/OUTCOME.md`               | always-loaded  | `T-outcome-write`   | Create or update `.claude/OUTCOME.md` for a repository                                                    |
| `rules/core/PREFLIGHT.md`             | always-loaded  | `T-impl-scope`      | An implementation-scope change to existing code, spanning more than one file                              |
| `rules/development/TOOLS.md`          | always-loaded  | `T-search-choice`   | A code-search task with an ambiguous choice between literal text search and structural search             |
| `rules/conventions/DOCUMENTS.md`      | path-triggered | `T-doc-routing`     | Decide which document (`rules/`, `docs/decisions/`, `CLAUDE.md`, `docs/wiki/`) a new directive belongs in |
| `rules/conventions/MARKDOWN.md`       | path-triggered | `T-md-prose`        | Write or edit Markdown prose under an LLM-facing or human-facing path                                     |
| `rules/conventions/PLUGIN.md`         | path-triggered | `T-plugin-edit`     | Edit the plugin manifest under `.claude-plugin/`                                                          |
| `rules/conventions/SKILL_REFACTOR.md` | path-triggered | `T-skill-refactor`  | Bring an existing skill back in line with its conventions                                                 |
| `rules/conventions/SKILLS.md`         | path-triggered | `T-skill-author`    | Author a new skill under `skills/`                                                                        |
| `rules/conventions/SUBAGENT.md`       | path-triggered | `T-agent-author`    | Author or edit a subagent definition under `agents/`                                                      |
| `rules/conventions/WORKFLOWS.md`      | path-triggered | `T-workflow-author` | Author or edit a workflow script under `workflows/`                                                       |
| `rules/development/E2E.md`            | path-triggered | `T-e2e-spec`        | Write or edit an E2E/Playwright spec                                                                      |
| `rules/development/SOURCING.md`       | path-triggered | `T-api-source`      | Write source code that calls a framework or library API in a covered language                             |
| `rules/development/TESTING.md`        | path-triggered | `T-test-edit`       | Add or edit a test file in a covered language for changed behavior                                        |
| `rules/development/TIDYINGS.md`       | path-triggered | `T-cleanup-pass`    | A cleanup pass in edited files, after the main task, before commit                                        |

## What `runs` means

`runs` in each observation records, per wiped-arm run, whether the transcript honored the
specific directive the triggering task exercises, as True or False. `arms.judge_runs` folds
it into `complies` and `verdict.classify` turns that into a verdict; this file does not
restate either mapping.

A violation never reads as keep on its own. `arms.RUN_COUNT` and `arms.PASS_THRESHOLD` decide
only how many runs must agree before `complies` is set at all, so a human still confirms the
violation traces to the removed element rather than to run noise.
