# Wiki page template

/scribe writes with this skeleton when creating/promoting a page in Phase 6. One pattern per page, with a kebab-case filename `<共通項名>.md`. Replace `<...>` at generation time.

## Template

Each page is structured in the order 内容 → 定型手順 → 参照コード → 由来 → 根拠. In 参照コード, write the current-code locations verified in Phase 4 as `path` + symbol name (function/type/heading), with no line numbers. Transcribe a code excerpt only when the shape of the pattern itself is the point, up to a few lines. 由来 is an optional section; write only the DRs judged Yes in Phase 5, and omit the whole section when nothing qualifies. In 根拠, write the PR/issue numbers of the original discussions, and write `(research)` instead of a number for anything sourced from `.claude/workspace/research/`. Never write the research file path。

```markdown
# <共通項名>

## 内容

何をする/しないかの言語化（1〜3 文）。

## 定型手順

繰り返す手順・チェックリスト（あれば）。

## 参照コード

- `path/to/file` の `シンボル名`（何が読めるか1行）

## 由来

- `docs/decisions/<NNNN>-<タイトル>.md`（この決定から派生。1行で何を決めた DR か）

## 根拠

- #12 何があったか1行
- #34 何があったか1行
- (research) 何が分かったか1行
```
