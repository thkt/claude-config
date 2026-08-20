# Pre-writeout verification

Referenced from /think Phase 3 step 8. Pass it once before writing the plan out.

Verify from the same repository root as the build workflow's Revalidate; fix or drop any failing line. When `base:` names a branch other than the current checkout, verify file existence via `git cat-file -e <base>:<path>` instead of `test -f <path>`, and anchors via `git show <base>:<path> | ugrep -F '<pattern>'`.

1. Each `### Preconditions` line: paths via `test -f <path>`, anchors via `ugrep -F '<pattern>' <path>` (base-branch forms above when base differs)
2. Every `units[].files` and `reference_module.files` entry that refers to an existing file, via `test -f <path>` (same base-branch substitution)
3. If any unit touches an existing file while `### Preconditions` is empty or absent, that is a failure; add a line anchoring the load-bearing dependency
4. A `reference_module: null` with no stated reason in the prose fails
5. No overflow against the line-count rules in templates/plan.md
6. Count each non-seam unit's `files` entries and T-NNN entries; every count stays within the unit caps. If one exceeds them, split it and re-verify
7. Run test_command once from the repository root. On a failure whose cause predates the plan (missing script, repo-wide debt), rescope the command per `### test_command` and state the scoping reason in the plan prose
8. No T-NNN entry covers a criterion test_command cannot execute. Move any such entry to `### Manual verification`
