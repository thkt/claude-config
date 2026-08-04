---
status: "accepted"
date: 2026-04-10
---

# ADR-0037: sae フィルタヘルパーを amici 抽出前提で yomu パターンに揃える

Context: sae #50（hybrid_searchへのフィルタ追加）

## Context and Problem Statement

saeの `hybrid_search` / `fts_search` / `vec_search` にタグ・カテゴリ・筆者フィルタを追加した（Issue #50）。
将来sae/yomu/recallの共通クレート `amici` に抽出するため、実装パターンをyomuに揃える必要がある。

## Considered Options

- `append_eq_filter` ヘルパーを導入し category/created_by を統合
- 個別ヘルパーのまま維持
- `append_in_filter` を今 sae に追加

## Decision Outcome

### `append_eq_filter` を導入し、category/created_by ヘルパーを統合する

```rust
fn append_eq_filter(
    sql: &mut String,
    params: &mut Vec<Box<dyn rusqlite::types::ToSql>>,
    column: &str,
    value: Option<&str>,
)
```

yomuの `append_type_filter(sql, params, column: &str, values)` と同じく **column を引数で受ける形**にする。
`append_category_filter` / `append_created_by_filter` の個別ヘルパーは廃止し、呼び出し側でcolumnを明示する。

```rust
// call site
append_eq_filter(&mut sql, &mut params, "p.category", category);
append_eq_filter(&mut sql, &mut params, "p.created_by", created_by);
```

### `append_in_filter` は追加しない

saeの `append_tags_filter` は `EXISTS (json_each(...))` でラップされており、
汎用の `AND column IN (?)` パターンと構造が異なる。現状saeに `append_in_filter` の用途はない。
amici抽出時にyomu側の `append_type_filter` を `append_in_filter` ベースにリファクタする。

### `append_tags_filter` は sae 固有として残す

esaのtagsカラムはJSON配列格納。`json_each` + EXISTSサブクエリはesaドメイン固有でありamici対象外。

## Consequences

### amici 抽出時に移動できるもの

- `anon_placeholders` / `in_placeholders` / `as_sql_params`
- `append_eq_filter`

### sae に残るもの

- `append_tags_filter`（esa JSON配列固有）

### yomu でやること（amici 抽出時）

- `append_type_filter` を `append_in_filter` ベースにリファクタ
- `append_in_filter` をamiciに定義

## Alternatives Considered

**個別ヘルパーのまま維持**: column名がヘルパー内にハードコードされ、amici抽出時にgeneric化が必要になる。早期に揃えるコストが低いため採用しない。

**`append_in_filter` を今 sae に追加**: YAGNI。使用箇所がなく、tagsフィルタの構造とも合わない。
