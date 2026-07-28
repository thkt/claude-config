# REFERENCE_INDEX.md Format Spec

The canonical definition of the row format that `docs/REFERENCE_INDEX.md` must hold. It documents the implementation behavior read by `workflows/code.js`'s `parseReferenceIndexRows`/`SUPPORTED_GLOB_CHARS`/`BARE_DOUBLE_STAR` as the authority (ADR-0091).

## Row format

A row is a Markdown table row with 3 columns: `glob`/`description`/`path`.

```
| glob | description | path |
| --- | --- | --- |
| src/*.tsx | Component convention | docs/conventions/component-tsx.md |
| - | Error-handling format convention. Whether to read it is a judgment call | docs/conventions/error-handling.md |
```

| Column      | Meaning                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| glob        | The condition under which this row is injected into the implementation step. Matched against the unit's target file paths. `-` is an unconditional candidate (below) |
| description | A one-line description. Material the implementation agent uses to judge whether to read the row                                                                      |
| path        | The repo-relative path of the reference document to have read                                                                                                        |

## Table constraint

`docs/REFERENCE_INDEX.md` holds exactly one table. The first 2 lines (the header row `| glob | description | path |` and the separator row `| --- | --- | --- |`) are followed directly by the data rows.

The parser (`parseReferenceIndexRows`) collects lines starting with `|`, unconditionally skips the first 2, and parses the rest as data rows. It never validates the header row's wording. Appending a second table to the same file therefore lets that table's separator row (`| --- | --- | --- |`) parse as a valid 3-column row, silently smuggling in a `glob: "---"` ghost row that never matches anything. Keep exactly one table.

A row that does not split into 3 columns (a broken row) is excluded from the parsed result, and the excluded count is recorded in the `reference-index: parsed N/M table rows` log line.

## Supported glob subset

The `glob` column may contain only the following character set (`SUPPORTED_GLOB_CHARS`).

- Alphanumerics and underscore (`\w`)
- `.` `-` `/` `*`

Within that subset, only 2 tokens carry metacharacter meaning: `**/` and `*` (`globToRegExp`).

| Token | Match scope                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| `**/` | Matches zero or more directory levels (`docs/**/*.md` matches both `docs/readme.md` and `docs/sub/readme.md`)                  |
| `*`   | Matches any string within a single segment, not crossing `/` (`src/*.tsx` matches `src/button.tsx` but not `src/app/page.tsx`) |

A bare `**` not followed by `/` (e.g. `src/**`) passes the character-set check but is not recognized as the `**/` token during tokenization; it decomposes into two `*` tokens and degrades to single-segment matching. To prevent this silent gap, `BARE_DOUBLE_STAR` detects it separately and treats it as unsupported.

Both sides of the `glob` column and the file path are normalized (leading `./` or `/` stripped) before comparison. Which side carries the prefix does not affect the match.

## Meaning of a `-` row

A row whose `glob` column is `-` is excluded from glob matching and is always presented as an injection candidate regardless of the unit's target files. It appears in the implementation prompt as `Consider reading: <path> (<description>)`, leaving whether to read it to the implementation agent's judgment. A `-` row is also exempt from the character-set check and the `BARE_DOUBLE_STAR` check.

## Handling of unsupported rows

A row that fails the character-set check, or one containing a bare `**`, is excluded from matching and is not injected into the implementation prompt. The exclusion is never silent: it is recorded as a `kind: "unsupported-glob"` anomaly along with the `glob` column's value and the reason.

## Injection order

A matched, specific row (`Read before implementing: <path>`) is placed after the `-` row candidates (`Consider reading: <path> (<description>)`). Combined with the later-line-wins rule, the specific read order always outranks the discretionary candidates.

## Size watch

Watch for an index exceeding one screen as a sign of over-injection (ADR-0091). The line-count threshold and its mechanical detection belong to the stock skill's check-index.js.
