# Empty phrases (English)

Detect and fix LLM-style empty phrasing in the PR body. Use alongside prose-review.md when the body is in English.

| Pattern            | Signal                                                                          | Fix                                                    |
| ------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Boilerplate opener | `This PR introduces/implements/adds...`                                         | Start with the problem solved or the outcome           |
| Empty intensifier  | `comprehensive`, `robust`, `seamless`, `thorough`                               | Drop or replace with specifics such as counts or names |
| Filler verb        | `leverage`, `utilize`, `facilitate`                                             | Use `use`, `do`, `let`                                 |
| Vague quantifier   | `various changes`, `multiple improvements`, `several fixes`                     | Enumerate or count                                     |
| Hedge stacking     | `might potentially`, `could possibly`, `may perhaps`                            | One hedge maximum, or commit                           |
| Filler phrase      | `It should be noted that...`, `Happy to discuss`, `Looking forward to thoughts` | Delete. State the fact or ask directly                 |
