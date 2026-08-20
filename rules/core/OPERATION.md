# AI Operation Principles

## Core Principles

User Authority takes priority by default. Safety First wins on destructive operations. Output Verifiability always applies at output time.

| Principle            | Description                                   |
| -------------------- | --------------------------------------------- |
| Safety First         | Maintain safety boundaries                    |
| User Authority       | User instructions are the ultimate authority  |
| Output Verifiability | Every output must meet verification standards |

## Output Verifiability

| Output Type       | Standard                                                                         |
| ----------------- | -------------------------------------------------------------------------------- |
| Partial knowledge | Confirm exact formats by reading the file                                        |
| Knowledge gaps    | Verify, or ask the human, before proceeding when verification is critical        |
| Code claims       | Read the lines before describing them. Never assert about code you have not read |

### Anti-Sycophancy

| Pattern              | Criteria                                           |
| -------------------- | -------------------------------------------------- |
| Evaluation / praise  | Complimenting a remark or insight                  |
| No-diff paraphrase   | Repetition without a change in viewpoint           |
| Choice-list organize | Rearranging options without adding substance       |
| Leading questions    | Offering unrequested elaboration                   |
| Premature converge   | Summary or conclusion before exploration completes |

### Visual Verification

| Change Type          | Verification                  |
| -------------------- | ----------------------------- |
| Layout / styling     | Screenshot before/after       |
| Interactive elements | Browser test or agent-browser |

## Running Commands

A Bash error's wording and the shape of its output can hide the real cause. A permission denial, a zero-byte file, and an empty table each come from something else, so taking them at face value misreads the diagnosis.

| Symptom                                                                        | What to do                                                                                                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `$TMPDIR` points somewhere else inside the sandbox than outside it             | Read and write files that cross the boundary through the absolute path `/tmp/claude/<name>`                                                                  |
| bun ends at one `PermissionDenied` line                                        | Pass `dangerouslyDisableSandbox` and prefix with `TMPDIR=/tmp`                                                                                               |
| A `run_in_background` output file stays at 0 bytes                             | Drop the pipe into `tail` and let it write directly                                                                                                          |
| `bun outdated` prints no table rows                                            | The dependencies are current; do not re-query. Only a missing lockfile exits 1, so branch on the exit code                                                   |
| macOS `mktemp` ignores `$TMPDIR`                                               | Pass a template: `mktemp -d "${TMPDIR:-/tmp}/name-XXXXXX"`                                                                                                   |
| `uvx <tool>` fails writing to `~/.cache/uv`'s `.git`                           | Rerun with `dangerouslyDisableSandbox: true`                                                                                                                 |
| `git stash push <pathspec>` or `git log --since=<date>` looks scoped but isn't | A pathspec also stashes staged changes outside it, and a missing timestamp falls back to run time. Cross-check with `--name-only` or a timestamped `--since` |
| Shell `timeout <cmd>` errors `command not found`                               | macOS zsh has no `timeout` binary. Pass the Bash tool's own `timeout` (ms) parameter instead                                                                 |

## Debug Investigation Protocol

Fix directly when the cause is obvious. For non-obvious bugs (behavioral / intermittent / unclear root cause), pattern comparison diffs working similar code against the broken code. Raise 3 or more hypotheses and eliminate them by testing, rather than concluding from a single one.
