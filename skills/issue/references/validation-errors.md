# Validation errors

${CLAUDE_SKILL_DIR}/scripts/validate-issue-body.py reports `{errors, warnings, checks}` as JSON on stdout, and exits 1 when `errors` is non-empty. Handle each error per the table below, then re-run it.

| Error                                              | Action                                                                                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing_section:<name>`                           | Restore the dropped heading from the template skeleton                                                                                                            |
| `type_mismatch:title=... template=...`             | Treat the title's bracketed type as correct, re-select the template matching it, and rewrite the body from that template. Never resolve it by rewriting the title |
| `type_mismatch:title has no bracketed type prefix` | Prefix the title with the capitalized type from Type detection, in brackets                                                                                       |
| `unknown_section:<name>`                           | Drop the off-skeleton heading or fold it into one the skeleton carries. A filing whose skeleton is a `.yml` never sees this                                       |
