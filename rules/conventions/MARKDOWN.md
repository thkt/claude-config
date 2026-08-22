---
paths:
  - ".claude/**/*.md"
  - ".ja/**/*.md"
  - "CLAUDE.md"
  - "README.md"
  - "agents/**/*.md"
  - "docs/**/*.md"
  - "rules/**/*.md"
  - "skills/**/*.md"
---

# Markdown Conventions

Conventions for Markdown files under `.claude/`. Anything inside a code block or inline code is out of scope.

## File scope

Scope is judged by the path without the `.ja/` prefix.

| Scope        | Paths                                                                     |
| ------------ | ------------------------------------------------------------------------- |
| LLM-facing   | `CLAUDE.md`, `agents/**`, `skills/**`, `rules/**`, `.claude/workspace/**` |
| Human-facing | `docs/**`, `README.md`                                                    |

## Symbols

In `.ja` the textlint hook collapses the spaces around `/`. List a Latin-letter enumeration with commas when the collapsed form reads as a path, keep `CI/CD` and `try/catch` as they are, and wrap slash commands like `/fix` in inline code.

| Symbol | Use                                           | Example                             |
| ------ | --------------------------------------------- | ----------------------------------- |
| `/`    | AND parallel enumeration                      | `Safety First/Output Verifiability` |
| `.`    | Separator between independent rules           | `Check scope. Do not skip`          |
| `()`   | Supplementary condition only                  | `Skip for follow-up (same session)` |
| `>`    | Priority order (prefer left, fall back right) | `CLI tool > built-in equivalent`    |
| `→`    | Step sequence                                 | `Observe → analyze → conclude`      |
| `§`    | Section reference                             | `phase.md § Gate rule`              |
| `+`    | Composition of components                     | `root causes + Gate decision`       |

## Inline code

Judge by whether removal causes misreading. Angle-brackets like `<branch>` are the exception.

| Keep                                                         | Remove                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| Identifiers or commands mixed with normal text in a sentence | Columns of same-type cells self-evident from the column name |
| Tokens containing placeholders                               | Emphasis-only wrapping                                       |
| Escapes and symbols that must stay distinguishable           | List items already distinguished by symbols                  |

## Do not

| Pattern                                 | Applies to | Fix                                                                                                                                             |
| --------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `≠`                                     | All        | Rewrite as positive form or use `is not X`                                                                                                      |
| `()` for contrast                       | All        | Split with `.`                                                                                                                                  |
| `—`                                     | All        | Split into sentences with `.`, or replace with `,` / `:` / `-` by context                                                                       |
| Line-ending `:` or `Label: value`       | All        | Promote to a heading or a table, or rewrite as prose. Literal colons stay fine                                                                  |
| All-caps for emphasis                   | All        | Use normal case                                                                                                                                 |
| Physical line breaks inside a paragraph | All        | Write each paragraph on a single line. Tooling handles soft-wrapping                                                                            |
| A table explained after it              | All        | Put above the table what its rows need to be read: the rule, the context, the exceptions. Prose that continues past the table stays where it is |
| `**bold**`                              | LLM-facing | Use tables or sections. Convert bold-first bullets to a table                                                                                   |
| Emoji in prose                          | LLM-facing | Remove. User-visible emoji are the exception                                                                                                    |
| Unicode decoration                      | Prose      | Use ASCII                                                                                                                                       |

## References

Depth goes 1 level in Skills and 3 levels in Rules / Docs.

| Forbidden pattern     | Reason                                        |
| --------------------- | --------------------------------------------- |
| Circular (A → B → A)  | Creates unresolvable dependencies             |
| Already in CLAUDE.md  | Globally loaded files don't need re-reference |
| Speculative reference | Reference only what the current context reads |

## Section vocabulary

For a skill with a sequential procedure, the top-level sequential unit is `## Phase N`.

| Target                        | Vocabulary                                                      |
| ----------------------------- | --------------------------------------------------------------- |
| Top-level sequential unit     | `Phase N`                                                       |
| Second tier inside a Phase    | `Step`. Such as a numbered column inside a single Phase's table |
| Non-sequential prep/reference | Its own name (Input, Setup, Output). Not a Phase                |
| Independent enumerated checks | The dimension or category name. Not a Phase                     |

## Removing duplicate instructions

| Duplicate of                                       | Deletable                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| System prompt                                      | Only when every line and section is covered. Re-check on model updates      |
| `output-styles/**`                                 | Never delete from `rules/`. Output styles can be switched                   |
| Another always-loaded `rules/` file                | Delete the compressed restatement, keep the table that carries the criteria |
| Anything whose removal relaxes a threshold or gate | Keep until a false positive shows up in practice                            |
| A duplicate that works as a reverse index          | Keep it. The path from situation to principle exists only in the index      |
