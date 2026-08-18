# DR Gaps Audit レポートテンプレート

`/census` Phase 5 が出力するレポートの骨格。Source File Decisions はソースファイルごと、Prose Document Decisions はドキュメントごとに `###` セクションを繰り返す。判断のないソースファイルは末尾の 1 行に束ねる。判断のないドキュメントは、当該 `###` 配下に `no decisions found` と記録する。

## テンプレート

`{...}` は検出事項から置換する。enum セルは、`/` 区切りの選択肢から該当値を選ぶ。DR Promotion Candidates の 3 行は challenge 判定と Final の対応例で、候補ごとに該当する 1 行を書く。

```markdown
# DR Gaps Audit: {YYYY-MM-DD}-{HHMMSS}

## Summary

| Metric                  | Value         |
| ----------------------- | ------------- |
| Scope                   | {repo / path} |
| Source files scanned    | {N}           |
| Documents scanned       | {N}           |
| Decision candidates     | {N}           |
| DR-covered (excluded)   | {N}           |
| Net new candidates      | {N}           |
| DR promotion candidates | {N}           |

## Source File Decisions

### {file} ({N} lines)

| #   | Line   | Decision  | Documented?        | Incomplete-contract? | Impact    | Reversibility       |
| --- | ------ | --------- | ------------------ | -------------------- | --------- | ------------------- |
| 1   | {line} | {summary} | Yes / Partial / No | Yes / No             | H / M / L | high / medium / low |

No net-new decisions in {files}.

## Prose Document Decisions

### {file}

| #   | Line   | Decision Verb | Decision  | DR Coverage    | Impact    | Reversibility       |
| --- | ------ | ------------- | --------- | -------------- | --------- | ------------------- |
| 1   | {line} | {verb}        | {summary} | None / DR-{id} | H / M / L | high / medium / low |

## DR Promotion Candidates (post-challenge)

keep {N} / downgrade {N} / drop {N}

| #   | Candidate                   | Initial | Challenge | Final          |
| --- | --------------------------- | ------- | --------- | -------------- |
| 1   | {source}:{line} - {summary} | promote | keep      | DR             |
| 2   | {source}:{line} - {summary} | promote | downgrade | inline-comment |
| 3   | {source}:{line} - {summary} | promote | drop      | skip           |
```
