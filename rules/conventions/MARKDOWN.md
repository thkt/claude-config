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
  - "workspace/**/*.md"
---

# Markdown Conventions

Conventions for Markdown files under `.claude/`.

## File scope

Which conventions apply depends on the reader. Scope is judged by the path without the `.ja/` prefix.

| Scope        | Paths                                                             |
| ------------ | ----------------------------------------------------------------- |
| LLM-facing   | `CLAUDE.md`, `agents/**`, `skills/**`, `rules/**`, `workspace/**` |
| Human-facing | `docs/**`, `README.md`                                            |

## Symbols

| Symbol | Use                                           | Example                               |
| ------ | --------------------------------------------- | ------------------------------------- |
| `/`    | AND parallel enumeration                      | `Safety First / Output Verifiability` |
| `.`    | Separator between independent rules           | `Check scope. Do not skip`            |
| `()`   | Supplementary condition only                  | `Skip for follow-up (same session)`   |
| `>`    | Priority order (prefer left, fall back right) | `CLI tool > built-in equivalent`      |
| `→`    | Step sequence                                 | `Observe → analyze → conclude`        |
| `§`    | Section reference                             | `phase.md § Gate rule`                |
| `+`    | Composition of components                     | `root causes + Gate decision`         |

## Inline code

Judge backtick use by whether removal causes misreading. Being a literal or an identifier is not a reason to wrap, and if removal causes no misreading, leave it unwrapped. Angle-brackets like `<branch>` are the exception.

| Keep                                                         | Remove                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| Identifiers or commands mixed with normal text in a sentence | Columns of same-type cells self-evident from the column name |
| Tokens containing placeholders                               | Emphasis-only wrapping                                       |
| Escapes and symbols that must stay distinguishable           | List items already distinguished by symbols                  |

## Do not

| Pattern                                 | Applies to | Fix                                                                            |
| --------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| `≠`                                     | All        | Rewrite as positive form or use `is not X`                                     |
| `()` for contrast                       | All        | Split with `.`                                                                 |
| `—`                                     | All        | Split into sentences with `.`, or replace with `,` / `:` / `-` by context      |
| Line-ending `:` or `Label: value`       | All        | Promote to a heading or a table, or rewrite as prose. Literal colons stay fine |
| All-caps for emphasis                   | All        | Use normal case                                                                |
| Physical line breaks inside a paragraph | All        | Write each paragraph on a single line. Tooling handles soft-wrapping           |
| Paragraph after a table                 | All        | Put the explanation (rule, context, exceptions) before the table               |
| `**bold**`                              | LLM-facing | Use tables or sections. Convert bold-first bullets to a table                  |
| Emoji in prose                          | LLM-facing | Remove. User-visible emoji are the exception                                   |
| Unicode decoration                      | Prose      | Use ASCII                                                                      |

## Reference depth

| Scope      | Max levels |
| ---------- | ---------- |
| Skills     | 1          |
| Rules/Docs | 3          |

## Section vocabulary

For a skill with a sequential procedure, the top-level sequential unit is always `## Phase N`. Reserve `Step` for a second tier that subdivides one Phase (such as a numbered column inside a single Phase's table). A non-sequential prep or reference section keeps its own name (Input, Setup, Output) and is not a Phase. Independent enumerated checks (dimensions, categories) are not Phases either.

## Forbidden references

| Pattern               | Reason                                        |
| --------------------- | --------------------------------------------- |
| Circular (A → B → A)  | Creates unresolvable dependencies             |
| Already in CLAUDE.md  | Globally loaded files don't need re-reference |
| Speculative reference | Reference only what the current context reads |

## Removing duplicate instructions

When an always-loaded instruction turns out to duplicate something else, what it duplicates decides whether it can be deleted.

| Duplicate of                                       | Deletable                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| System prompt                                      | Only when every line and section is covered. Keep it when only the gist matches. Tied to the model generation, so re-check on model updates |
| `output-styles/**`                                 | Never delete from `rules/`. The user can switch output styles, so deleting makes the instruction style-dependent                            |
| Another always-loaded `rules/` file                | Delete the compressed restatement, keep the table that carries the criteria                                                                 |
| Anything whose removal relaxes a threshold or gate | Keep until a false positive shows up in practice                                                                                            |

## Out of scope

- Inside code blocks / inline code
