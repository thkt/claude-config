# Empty phrases (English)

Detect and fix LLM-style empty phrasing in the issue body. Use alongside prose-review.md when the body is in English. Fix empty phrasing of the same nature even when the table below does not name it. The Signal column gives detection cues, so extend each one to phrasings of the same shape.

| Pattern            | Signal                                                     | Fix                                                    |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------------ |
| Boilerplate opener | `This issue describes/reports/proposes...`                 | Start with the problem, not self-description           |
| Empty intensifier  | `comprehensive`, `robust`, `thorough`                      | Drop or replace with specifics such as counts or names |
| Vague quantifier   | `various issues`, `multiple concerns`, `several bugs`      | Enumerate or count                                     |
| Hedge stacking     | `might potentially`, `could possibly`, `may perhaps`       | One hedge maximum, or commit                           |
| Filler phrase      | `Looking forward to your thoughts`, `Any feedback welcome` | Delete. State the fact or ask directly                 |
