# Verification Procedures

Defines the procedures referenced by the /research Phase 4 close and the Phase 5 sweep.

Which one applies is decided by the kind of finding. Use Cross-method verification for exhaustiveness findings and Primary-source verification for external-behavior claims, structurally, with no self-judged exclusion of a finding. Verifying library API behavior applies `~/.claude/rules/development/SOURCING.md`.

## Cross-method verification

Apply each trigger structurally; no self-judged exclusion of a finding is allowed. Apply this verification when a finding claiming exhaustiveness drives downstream PR scope or crosses a repo boundary. The targets are claims like "no caller", "X is the only Y", "exhaustive list", and "unused in [repo set]". Verify each with at least 2 of ugrep, bfs, Agent(Explore), and targeted Read. On disagreement, flag the discrepancy and identify the tool error before recording. A single-tool zero result is suspect, not authoritative.

## Primary-source verification

Verify external-behavior claims against primary sources.

1. Extract findings whose Source references external behavior not executed this session. Typical cases are hook firing timing, action / parser required schema, library API behavior, and cited-paper claims. Limit to findings where the conclusion, a Next Action, or Disconfirmation depends on the claim being correct
2. Verify the extracted claims against primary sources in one batch. Use `scout fetch <official docs URL>` for web docs and `scout repo-read` / `scout repo-overview` for sources on GitHub (use-cli-scout is the canonical command reference)
3. When a primary source is unreachable, such as paywall, no docs, fetch failure, or scout not being installed, keep the finding but mark it `unverified external claim`, and do not use it as Disconfirmation evidence or a Next Action premise

A repository's README reflects an unreleased main, so it is not a primary source for what the published version does. Confirm what the published version accepts with `npx <pkg>@latest <cmd> --help` and by running it.

## Reading a zero-result

A zero-result does not separate "it does not exist" from "the query is shaped wrong". Before concluding absence, round-trip the same query against a case that returns non-zero. To claim a filter works, measure it with a value that actually has matches. Measuring with an unused value returns zero and cannot be told apart from the filter failing.

| Query                                      | Another reason it returns zero                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| Multiple words in `gh issue list --search` | It ANDs the words, so one word missing the mark returns zero                        |
| A filter on a label or a field             | No item carries that value. It returns the same zero as a value that does not exist |
| An issue search scoped to a repo           | The issue lives in your own repo, not upstream. Re-query with `--owner <yourself>`  |

## Same-origin sweep

After a root cause is confirmed in Bug investigation, sweep the artifacts that share its origin for sibling defects.

1. Locate the commit that introduced the root-cause file via `git log --follow --diff-filter=A`, then enumerate every file in that commit via `git show --stat`
2. If the commit message or a file header carries a generation marker such as `auto-generated from X` or a template / deploy note, add every file originating from X to the sweep
3. For each sibling, identify the action / parser / loader that reads it as its consumer, fetch the consumer's required spec inline, and check the sibling against it. The scout procedure is the same as the primary-source verification above
4. When siblings cross-reference each other's values (a config's keys / block-list vs a form's options), diff the value sets and flag self-defeating alignments (a block-list containing every selectable value, a reference to a value no sibling defines)
5. Record per sibling: pass / same-kind defect / different-kind defect, with evidence
