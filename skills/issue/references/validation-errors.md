# Validation errors

${CLAUDE_SKILL_DIR}/scripts/validate-issue-body.py writes `{errors, warnings, checks}` to stdout as JSON. It exits 1 when `errors` carries one or more entries. Fix each error per the table below, then run the script again.

| Error                                              | Action                                                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing_section:<name>`                           | Restore the heading dropped from the skeleton, or the one the type always carries even when the skeleton omits it                                                          |
| `type_mismatch:title=... template=...`             | Treat the bracketed type in the title as correct, re-select the template matching that type, and rewrite the body from it. Do not resolve it by rewriting the title        |
| `type_mismatch:title has no bracketed type prefix` | Capitalize the type name from Type detection, wrap it in brackets, and put it at the head of the title                                                                     |
| `unknown_section:<name>`                           | Delete the heading the skeleton does not carry, or move its content into one the skeleton does. This error never appears when a repository template served as the skeleton |
| `placeholder_left:<count> [<first>]`               | Replace the placeholder named in the error with the content it asks for                                                                                                    |
| `unfilled_section:<name>`                          | Write the section's content. An empty checkbox, a list marker with nothing after it, and `TBD` all read as unwritten                                                       |
