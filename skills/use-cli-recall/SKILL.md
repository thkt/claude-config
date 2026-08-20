---
name: use-cli-recall
description: Search past Claude Code/Codex sessions via recall CLI.
when_to_use: 前に, あの時, また同じ, あの件, past decisions, recurring mistake, module first contact, temporal reference, structural echo, vague back-reference
allowed-tools: Bash(recall:*) Read
user-invocable: false
---

# use-cli-recall

## Triggers

When one applies, call without deliberation.

| Trigger              | Signal                                     |
| -------------------- | ------------------------------------------ |
| Temporal reference   | 「前に」「あの時」 past events / decisions |
| Structural echo      | Current problem mirrors a past situation   |
| Repetition           | 「また同じ」 recurring mistake             |
| Vague back-reference | 「あの件」 past work without specifics     |
| Module first contact | First edit to a file/module this session   |

## Commands

| Purpose           | Command                                                     |
| ----------------- | ----------------------------------------------------------- |
| Search            | `recall search "query"`. Shorthand: `recall "query"`        |
| Last N days       | `recall search "query" --days N`                            |
| Project filter    | `recall search "query" --project <path>`                    |
| Source filter     | `recall search "query" --source claude` or `--source codex` |
| Limit results     | `recall search "query" --limit N`. Default 10, max 100      |
| Show session      | `recall show <session-id>`                                  |
| Status            | `recall status`                                             |
| Incremental index | `recall index`                                              |
| Full rebuild      | `recall index --force`                                      |

## Query composition

Write bilingual queries upfront (e.g. `recall "認証 auth"`). FTS5 trigram tokenization cannot match JA terms of 2 chars or fewer; 認証 and 依存 hit 0. Embeddings do not bridge EN⇄JA (thkt/recall#51). Including both languages covers each search path.

## Weak-result retry

recall does not expand queries (caller-is-LLM, thkt/recall#25). Hybrid search returns nearest neighbors, so a poor query yields low-relevance results rather than 0 hits. When results are empty or low-relevance, rewrite the query yourself and retry once: synonyms, EN⇄JA variants, related concept terms.

## Pairing with code search

use-cli-recall answers past decisions; `ugrep` / `bfs` answer the current code state. Run both on these triggers.

| Trigger              | recall query                  | code search                  |
| -------------------- | ----------------------------- | ---------------------------- |
| Module first contact | module name, design rationale | module name, key identifiers |
| Structural echo      | past similar problem          | current similar code         |
