# Research: issue-104-rrf-merge-unification

Generated: 2026-05-08
Session: 422c2668-6695-4fcd-9d27-3d01c2434a75
Intent: Feature planning
Domain: General
Prior research: none found

## Purpose

`storage::rrf_merge` (free fn, hardcoded `RRF_K = 60.0`) と `retrieval::WeightedRrf::merge` (configurable struct) は同一 RRF アルゴリズムの二重実装である。Issue #104 が承認した「`storage::rrf_merge` 完全削除、後方互換維持しない」方針に対して、削除に必要な変更箇所、削除をブロックする前提、関連 docs / docstrings の追従要否を確認する。

## Key Findings

| Priority | Finding | Source | Next Action |
| -------- | ------- | ------ | ----------- |
| 1 | `storage::rrf_merge` の rurico 内利用は無し（再エクスポートと test のみ） | `src/storage.rs:7`, `src/storage/search.rs:140-156`, `src/storage/search.rs:300-328`; `ugrep -n "rrf_merge\|RRF_K" src/` 結果は上記 2 ファイルのみ | issue 受け入れ条件どおり安全に削除可 |
| 1 | downstream の唯一の caller は recall | `recall/src/search.rs:11,393`, `recall/src/hybrid.rs:40,46-,70,139`; yomu/sae/amici は `ugrep "rrf_merge\|WeightedRrf"` 結果ゼロ | recall#79 完了後に削除実行 |
| 1 | recall#79 は OPEN、recall の `Cargo.toml` は rurico を削除前 rev `7b739d1` に pin（前提条件未充足） | `gh issue view 79 --repo thkt/recall` で state OPEN, `recall/Cargo.toml:19,29` | recall#79 を先行 merge → recall の `WeightedRrf` ベース helper 完成 → 本 issue 着手 |
| 2 | `WeightedRrf::default()` は default config (`rrf_k=60.0`, fts/vector weight=1.0) で旧 `rrf_merge` と bit-equal — 数値互換は保証済み | `src/retrieval.rs:206-217` (docstring "bit-equal to the pre-Phase-4 `rrf_merge` primitive"), `src/retrieval.rs:745-765` (test `weighted_rrf_default_matches_unweighted_rrf` が検証) | recall#79 helper 実装の数値互換を担保 |
| 2 | 削除予定の test 3 件 (`rrf_merge_both_lists` / `rrf_merge_tied_scores_ordered_by_key` / `rrf_merge_empty_fts`) の振る舞いは既に `WeightedRrf` 側 test でカバー済み — coverage loss は無し | `src/storage/search.rs:300-328` (削除対象) と `src/retrieval.rs:745-806, 829-878` (`weighted_rrf_*` 9 件) を比較 | 削除前後で `cargo test --workspace` が green であることを確認するのみ |
| 2 | `tests/visibility.rs` は `rrf_merge` を含まない — public API 表面 test は再エクスポート削除で破綻しない | `grep -n "rrf_merge\|RRF_K" tests/visibility.rs` 結果 0 件 | 追加対応不要 |
| 3 | ADR 0004 の backward-compat 表 (`rrf_merge<K> \| Unchanged (used internally)`) は本 issue で supersede される | `docs/decisions/0004-retrieval-and-rerank-pipeline-contract-for-rurico.md:80` | ADR 0004 に補足 (Status 据え置き / 該当行に "superseded by issue #104" 注釈) または新規 ADR を起票 |
| 3 | ADR 0006 (eval-harness migration) §3 は `rrf_merge` を「stay in rurico」プリミティブとして列挙 | `docs/decisions/0006-eval-harness-migration-to-amici.md:34` | issue #104 適用時に当該行を更新（移行 scope の文脈なので削除対応として注記でも可） |
| 3 | `WeightedRrf` の docstring が削除対象 `rrf_merge` を name で参照 — 削除後は dangling reference | `src/retrieval.rs:211` (`"bit-equal to the pre-Phase-4 \`rrf_merge\` primitive"`) | 削除 PR で同 docstring を `1 / (60 + rank)` 直書きに置換 |
| 3 | ADR 0003 (`docs/decisions/0003-evaluation-methodology.md:13,25,163`) も `rrf_merge` を primitive として参照 | `grep -n rrf_merge docs/decisions/` | 既存 ADR を改変せず、削除 PR の References から繋ぐ運用で許容範囲 |
| 3 | CHANGELOG `[Unreleased] / Breaking Changes` セクションは既に複数項目あり、`storage::rrf_merge` 削除を 1 行追加するだけで足りる構造 | `CHANGELOG.md:1-65` | 削除 PR で Breaking 行を追記（API 表面の rev bump で既に next breaking 集約） |

## Available Data

| Type | Item | Note |
| ---- | ---- | ---- |
| File | `src/storage/search.rs` | 削除対象本体 (140-156: `rrf_merge`, 136: `RRF_K`, 300-328: test 3 件) |
| File | `src/storage.rs` | 7 行目の `pub use search::{... rrf_merge}` から `rrf_merge` を除外 |
| File | `src/retrieval.rs` | canonical 実装（`WeightedRrf`）。docstring 211 行目のみ追従改修 |
| File | `recall/src/search.rs:11,393`, `recall/src/hybrid.rs:40,46,70,139` | downstream caller — recall#79 で local helper `rrf_merge_strings` に置換予定 |
| File | `tests/visibility.rs` | public API 表面の保証 test。`rrf_merge` 言及無し |
| Tech | RRF (Reciprocal Rank Fusion) k=60 | デフォルト値、`WeightedRrf::default()` で再現可能 |
| Convention | rurico 公開 API は rev pin で downstream に固定、削除は破壊的変更を伴う | recall の `Cargo.toml:19` は `rev = "7b739d1"` pin |
| Convention | cross-repo 影響は別 issue で先行追従（CLAUDE 私的メモ "Cross-repo は Issue 化"） | issue #104 本体および recall#79 の "実装順序" 記述に明記 |
| Doc | `docs/decisions/0004-...md` | ADR 0004 (Retrieval Pipeline Contract) — `WeightedRrf` を canonical と位置づけ |
| Doc | `docs/decisions/0003-evaluation-methodology.md` | ADR 0003 — `rrf_merge` を primitive として参照（複数箇所） |
| Doc | `docs/decisions/0006-eval-harness-migration-to-amici.md` | ADR 0006 — `rrf_merge` を rurico に "stay" するプリミティブ群に列挙 |

## Constraints

| Category | Constraint |
| -------- | ---------- |
| 順序 | recall#79 (OPEN) の merge が前提。未完了状態で本 issue を実行すると recall がビルド不能 (issue 本文 "downstream 追従" + recall#79 "実装順序" の双方が明記) |
| 互換性 | `WeightedRrf::default()` は `rrf_merge` と bit-equal な数値結果を返す責務を負う（docstring 契約 + test `weighted_rrf_default_matches_unweighted_rrf`）。削除 PR で `WeightedRrf` 側の改変を伴わないこと |
| API 表面 | `storage` module からの `pub use rrf_merge` 削除は外部破壊的変更。CHANGELOG `[Unreleased] / Breaking Changes` への追記必須 |
| Test 品質 | 削除対象 3 test の振る舞いは `weighted_rrf_*` 9 件で既にカバー済 — `cargo test --workspace` の合計 pass 数は減るが coverage は維持 |
| 設計方針 | rurico 側 generic `merge_keys` API は追加しない（YAGNI 違反、issue 本文「検討 → 却下した代替」に明記）。recall 側 helper で吸収する |

## Disconfirmation Check

Searched: 「`rrf_merge` 削除はリスクが小さい・recall 以外の影響は無い」という leading hypothesis に対する反証材料。

Result: Found 3 件、いずれも accompanying doc/code 更新で解消可能。
- `docs/decisions/0004-retrieval-and-rerank-pipeline-contract-for-rurico.md:80` — backward-compat 表が `rrf_merge<K>` を `Unchanged (used internally)` と宣言。本 issue の方針はこの行を supersede する。Status: Accepted の ADR を改変するより、削除 PR の References に supersede 注記する運用で足りる。
- `docs/decisions/0006-eval-harness-migration-to-amici.md:34` — `rrf_merge` を「stay in rurico」プリミティブ群に列挙。文脈は「移行 scope 外」であって「永続保証」ではないため、削除 PR で当該行更新は望ましいが必須ではない。
- `src/retrieval.rs:211` — `WeightedRrf` の module-level docstring が `"bit-equal to the pre-Phase-4 \`rrf_merge\` primitive"` と削除対象を name 参照。削除と同一 PR で `"1 / (60 + rank)"` 直書きへ置換すべき dangling reference。

`ugrep -n "rrf_merge|RRF_K"` を rurico 全 src/、tests/、workspace/、docs/ に対して実行した結果、上記以外の implicit dependency / silent caller は発見されなかった。Issue 本文の「rurico 内部 caller 無し」「downstream は recall のみ」主張は再現確認できた。

## References

| Path | Description |
| ---- | ----------- |
| `https://github.com/thkt/rurico/issues/104` | 本 issue（refactor(rrf): storage::rrf_merge と retrieval::WeightedRrf を統合する） |
| `https://github.com/thkt/recall/issues/79` | downstream 先行追従 issue（前提条件、OPEN） |
| `/Users/thkt/GitHub/cli/rurico/src/storage/search.rs:136-156,300-328` | 削除対象コード |
| `/Users/thkt/GitHub/cli/rurico/src/storage.rs:7` | 削除対象 re-export 行 |
| `/Users/thkt/GitHub/cli/rurico/src/retrieval.rs:206-331` | canonical 実装（`WeightedRrf`） |
| `/Users/thkt/GitHub/cli/rurico/src/retrieval.rs:211` | 追従更新が必要な docstring |
| `/Users/thkt/GitHub/cli/rurico/docs/decisions/0004-retrieval-and-rerank-pipeline-contract-for-rurico.md` | Retrieval Pipeline Contract ADR |
| `/Users/thkt/GitHub/cli/rurico/docs/decisions/0003-evaluation-methodology.md` | Phase 1 評価メソドロジ ADR — `rrf_merge` を primitive として参照 |
| `/Users/thkt/GitHub/cli/rurico/docs/decisions/0006-eval-harness-migration-to-amici.md` | eval-harness 移行 ADR — `rrf_merge` を rurico 残留 primitive と列挙 |
| `/Users/thkt/GitHub/cli/recall/src/search.rs:11,393` | downstream caller |
| `/Users/thkt/GitHub/cli/recall/src/hybrid.rs:40,46,70,139` | downstream caller (test 3 件含む) |
| `/Users/thkt/GitHub/cli/recall/Cargo.toml:19,29` | rurico rev pin (`7b739d1`、削除前 rev) |

## Coverage Notes

Phase 1 で立てた質問はすべて確認済（issue が事実上既に明示しているため Phase 1 質問は形式的）。

- 「rurico 内部 caller の有無」: 無し（`pub use` re-export のみ、test 以外の利用はゼロ）
- 「downstream caller の網羅性」: yomu / sae / amici も `ugrep` で確認、未使用。recall のみ。
- 「`WeightedRrf` の数値互換」: docstring 契約 + 実装 test (`weighted_rrf_default_matches_unweighted_rrf`) で担保
- 「削除タイミング」: recall#79 (OPEN) の merge が必要十分条件
- 「ADR / docstring 追従」: 3 箇所を Disconfirmation Check に列挙 — 必須は `src/retrieval.rs:211` の docstring 更新のみ、ADR 0004 / ADR 0006 は References / 注記運用で許容

Unknown 残件: 無し。

## Next Steps

| Intent | Next Command |
| ------ | ------------ |
| Feature planning | `/think` で削除 PR の SOW（実装順序: ① recall#79 完了確認 ② recall rev bump (削除後 rurico を pin する rev は次手で確定) ③ rurico Issue #104 削除 PR ④ recall #79 PR 内で rurico rev bump、合計 3 リポ × 順序制約あり）を組む。または `/code` で削除 PR を直接実装（recall#79 の merge 完了後） |
