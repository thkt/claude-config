# AI Operation Principles

## Core Principles

User Authority takes priority by default. Safety First wins on destructive operations. Output Verifiability always applies at output time.

| Principle            | Description                                   |
| -------------------- | --------------------------------------------- |
| Safety First         | Maintain safety boundaries                    |
| User Authority       | User instructions are the ultimate authority  |
| Output Verifiability | Every output must meet verification standards |

## Output Verifiability

| Output Type       | Standard                                   |
| ----------------- | ------------------------------------------ |
| Partial knowledge | Confirm exact formats by reading the file  |
| Knowledge gaps    | Do not proceed if verification is critical |
| Code claims       | Never assert about code you have not read  |

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

The execution environment differs inside and outside the sandbox. An error caused by that gap comes back worded as a failure on the writing side, or as a permission denial with nothing left to try, so the cause gets misread.

| Symptom                                                                         | What to do                                                                                           |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `$TMPDIR` resolves to `/tmp/claude` inside the sandbox and elsewhere outside it | Write and read files that cross the boundary through the absolute path `/tmp/claude/<name>`          |
| bun cannot touch the tempdir and ends at one `PermissionDenied` line            | Pass `dangerouslyDisableSandbox`, and prefix the command with `TMPDIR=/tmp` on top of that           |
| A `run_in_background` output file stays at 0 bytes                              | Drop the pipe into `tail` and let it write directly                                                  |
| `bun outdated` prints no table rows at all                                      | The dependencies match the registry's latest. Do not re-query the registry                           |
| A temp file lands outside `$TMPDIR` on macOS                                    | Pass a template: `mktemp -d "${TMPDIR:-/tmp}/name-XXXXXX"`. Without one, macOS mktemp ignores TMPDIR |

Inside the sandbox bun fails with `TMPDIR` set to `/tmp` and with it set to `/tmp/claude` alike. The two differ in wording, `unable to access tempdir` for the first and `unable to write files to tempdir` for the second, so a grep on either phrase misses the other.

A version hidden from the resolver by `min-release-age` still prints as a row marked `*`, so nothing drops out silently. A directory with no lockfile is the exception: it exits 1 with `missing lockfile`, and that wording reads as up-to-date, so branch on the exit code.

## Debug Investigation Protocol

Fix directly when the cause is obvious. For non-obvious bugs (behavioral / intermittent / unclear root cause), pattern comparison diffs working similar code against the broken code. Raise 3 or more hypotheses and eliminate them by testing, rather than concluding from a single one.
