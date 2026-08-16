---
name: xlsx
description: Reads xlsx / ods / csv spreadsheets that the Read tool cannot open, converts merged-cell business documents into Markdown, and verifies that no cell was lost.
when_to_use: a path to a .xlsx / .xls / .ods file was given, read an Excel file, inspect spreadsheet contents, read a design document, spreadsheet contents, xlsx
allowed-tools: Bash Read
---

# xlsx

The Read tool cannot open an xlsx. Use hucre, installed in this repository, as a library to read the sheets.

## Steps

1. Look at the shape of the contents.

```bash
node ${CLAUDE_SKILL_DIR}/scripts/cli.js list <xlsx>
```

The sheet list and the fill ratio come out. The fill ratio is the share of cells holding a value, and it decides the next branch.

2. Decide how to read from the fill ratio.

| Fill ratio  | State                                                 | How to read                                               |
| ----------- | ----------------------------------------------------- | --------------------------------------------------------- |
| Under 20%   | Merges and layout-only empty cells take up most of it | Convert with extract, then read                           |
| 20% or more | Close to one record per row                           | Name the sheet and read it directly. No conversion needed |

3. Convert. Write the output outside the repository, or wherever the user asked for.

```bash
node ${CLAUDE_SKILL_DIR}/scripts/cli.js extract <xlsx> --out <dir> [--profile <name>] [--sheet <n|name>]
```

4. Check that nothing was lost. **Do not skip this check.** A wrong layout judgment deletes cells without raising an error, so reconciliation is the only thing that reveals it.

```bash
node ${CLAUDE_SKILL_DIR}/scripts/cli.js verify <xlsx> <dir>
```

`OK: every cell of N sheets survived into the output.` means done. On a loss it returns the sheet name and the first 40 characters of a lost cell, so fix the profile's judgment and run it again.

## Profiles

Layout-specific judgment lives in a profile. The definitions are in `profiles` in `scripts/convert.js`.

| Profile             | Target                                                            | Behavior                                                                     |
| ------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `generic` (default) | A file whose layout is unknown                                    | Reads nothing as a table. Only folds merged cells, so no information is lost |
| `ja-api-spec`       | A Japanese API design document with 項番 and パラメータ名 columns | Restores headings, parameter tables, two-tier headers and code blocks        |

Reach for `generic` first on an unknown layout. Add a profile only when you want tables restored. A profile carries five judgments, and a judgment set to null is not performed.

| Key                  | Judgment                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `docHeaderFirstCell` | When A1 holds this string, fold the first 3 rows as document information                                 |
| `heading`            | Make a 1-2 cell row matching this regex a heading                                                        |
| `tableHeadWords`     | Make a row matching this regex with 3 or more cells a table header                                       |
| `nestColumnLabel`    | In a column whose label contains this word, restore the cell position within the column as nesting depth |
| `code`               | Join single-cell rows matching this regex into a code block                                              |

## What decides the approach

**An intermediate file is not always needed.** When a single question is all you have, name the sheet, read it with `readXlsx`, and answer on the spot. Keep Markdown files only for repeated cross-file greps, for a human reader, or for tracking diffs in git.

The fill ratio decides what conversion buys. In a design document at 2.2% fill, one sheet came to 62,668 characters as raw JSON, 14,809 as plain CSV, and 3,287 after conversion. The gap is what the empty cells would have spent in tokens.

## Dependency

`hucre` is installed at the repository root (`bun add hucre`). Where it is absent, the script prints the install step and exits.

Do not use the CLI (`hucre convert`). It writes only the first sheet and drops the rest without a warning.
