# FTS5でのCJK検索

Date: 2026-03-23
Intent: Understanding
Topic: Infrastructure (search pipeline)

## Current Implementation

### Tokenizer: `porter unicode61`

[`src/db.rs:8`] `FTS_TOKENIZER = "porter unicode61"`

`porter` wraps `unicode61` to add English stemming. `unicode61` tokenizes on
Unicode word boundaries (whitespace, punctuation). CJK text without spaces is
treated as a single token.

### CJK Fallback: `instr()` scan

[`src/search.rs:55-68`] `has_cjk()` detects CJK characters in query terms.
[`src/search.rs:163`] If any term contains CJK, `use_instr = true`.

[`src/search.rs:189-202`] CJK queries use:

```sql
SELECT session_id, 0.0 as best_rank
FROM messages WHERE instr(text, ?) > 0 ...
GROUP BY session_id ORDER BY MAX(rowid) DESC LIMIT ?
```

Instead of FTS5 MATCH, this performs a full table scan with substring matching.

### Snippet extraction for CJK

[`src/search.rs:377-392`] Uses `substr()` + `instr()` instead of FTS5
`snippet()`:

```sql
SELECT substr(text, max(1, instr(text, ?1) - 60), 200)
FROM messages WHERE instr(text, ?1) > 0 AND session_id = ?2 LIMIT 1
```

### Test coverage

[`src/search.rs:715-862`] 7 CJK tests:
- `test_cjk_japanese_2char` -- 2-char query
- `test_cjk_single_char` -- 1-char query
- `test_cjk_no_match` -- no false positives
- `test_mixed_cjk_ascii_query` -- mixed CJK+ASCII
- `test_cjk_with_project_filter` -- filters work with instr path
- `test_cjk_recency_favors_newer` -- recency boost works
- `test_cjk_recency_with_candidate_overflow` -- candidate limit respected
- `test_korean_search` -- Korean Hangul

## Problem Analysis

### What works

- [✓] CJK queries return correct results via `instr()` fallback
- [✓] Single-character CJK queries work (1-char, 2-char)
- [✓] Filters (project, days, source) work with CJK queries
- [✓] Recency boost applies to CJK results

### What does not work

- [✓] `porter unicode61` treats "型安全についての議論" as a single token. Only
  exact full-string MATCH succeeds. Partial matches fail.
- [✓] `instr()` performs a full table scan (no index). O(n) where n = total rows
  in messages table.
- [✓] CJK results have `rank = 0.0` (no BM25 scoring). Ranking is recency-only.
- [✓] No FTS5 snippet highlighting for CJK (uses raw `substr`).

### Performance impact

- [→] With 6k sessions / ~27k QA pairs, `instr()` scan is fast enough today
  (~instant).
- [→] At 50k+ sessions, the full scan will become noticeable. No index = linear
  growth.
- [✓] Vector search (`vec_chunks`) works for CJK regardless -- embeddings are
  language-agnostic. The hybrid path partially compensates.

## Alternative Approaches

### Option A: FTS5 `trigram` tokenizer (separate table)

Verified via `sqlite3 :memory:`:

| Query length | trigram result |
| ------------ | ------------- |
| 1 char (型)  | no match      |
| 2 char (テス)| no match      |
| 3+ char      | match         |

- Pro: Uses FTS5 index (O(log n) lookup). BM25 ranking. `snippet()` works.
- Con: Minimum 3-character query. Separate FTS5 table needed (cannot combine
  `porter` + `trigram` on same table). Doubles FTS index size. Does not solve
  1-2 character CJK queries.
- Migration: Requires adding a second `messages_trigram` table + dual-query
  logic.

### Option B: Keep `instr()` for CJK (current)

- Pro: Works for all query lengths (1+ chars). Simple. No extra storage.
- Con: Full table scan. No BM25 ranking. No snippet highlighting.
- [→] Acceptable until corpus exceeds ~50k sessions.

### Option C: Dual tokenizer (porter unicode61 + trigram)

Add a second FTS5 table `messages_cjk USING fts5(... tokenize='trigram')` indexed
in parallel. CJK queries use `messages_cjk MATCH` instead of `instr()`.

- Pro: Indexed CJK search. BM25 ranking. FTS5 snippets. Keeps porter for English.
- Con: Doubles storage for FTS data. 1-2 char CJK queries still need `instr()`
  fallback. Index time increases.

### Option D: `unicode61` with `tokenchars` (character-as-token)

`tokenize = "unicode61 tokenchars '...'"`

- [✓] Does not help. `tokenchars` adds characters *to* tokens, it does not split
  CJK runs into individual tokens.

### Option E: External custom tokenizer (better-trigram / ICU)

- `streetwriters/sqlite-better-trigram`: treats each CJK char as individual
  token. 1-char queries work.
- FTS5 ICU tokenizer: proper word segmentation via ICU library.
- Con: Requires C FFI integration into rusqlite's bundled SQLite. Adds external
  dependency. Non-trivial build complexity.

## Disconfirmation Check

Searched for evidence that `porter unicode61` handles CJK better than expected:

- Tested `unicode61` with spaced CJK text: "Rust の 型安全 について" -- partial
  MATCH works when spaces separate terms.
- [✓] But real session data does not have spaces between CJK words. The
  hypothesis holds: `porter unicode61` is ineffective for natural CJK text.

Also checked: does hybrid search compensate enough?

- [→] Vector search via Ruri v3 embeddings is language-aware and handles CJK
  well. But it requires embeddings to exist. Progressive embedding means early
  searches have no vector data. FTS5 is the primary path for users without
  `--embed`.

## Summary

| Aspect           | Status                                                    |
| ---------------- | --------------------------------------------------------- |
| Correctness      | [✓] CJK search works (via instr fallback)                |
| Performance      | [→] O(n) scan; acceptable at current scale (~27k rows)   |
| Ranking          | [✓] No BM25 for CJK; recency-only                       |
| Snippet quality  | [✓] Raw substr, no highlighting                          |
| 1-2 char queries | [✓] Supported (instr handles any length)                 |
| Vector fallback  | [→] Compensates when embeddings exist                    |

The current `instr()` approach is a pragmatic choice that prioritizes correctness
over performance. The main trade-off is O(n) scan cost, which is not yet a
bottleneck but will become one as the corpus grows.

## Improvement Path (if needed)

Progressive enhancement order:

1. Current `instr()` -- sufficient now
2. Add `trigram` FTS5 table for 3+ char CJK -- when scan latency is measurable
3. Keep `instr()` for 1-2 char CJK queries -- trigram cannot handle these
4. Vector search covers semantic CJK -- grows with progressive embedding

## Next Steps

Understanding complete. No immediate action needed.
