---
status: "proposed"
date: 2026-03-24
decision-makers: thkt
---

# ADR-0034: embedding + storage ユーティリティの共有クレート化 (rurico)

## Context and Problem Statement

yomu, sae, recallの3ツールでembeddingコード（~800 LOC/ツール）とsqlite-vecユーティリティ（~100 LOC/ツール）がコピーフォークで散在している。改善（例: length-sorted batching）を1箇所で直しても他2つに手動バックポートが必要。recallのembedding刷新（ADR-0031）が控えており、移行後にまた3ツールにコピーフォークするのは非効率。

コピーフォーク方針（ADR-0021, ADR-0032）は独立進化を許容する意図だったが、embeddingとsqlite-vec infraは3ツールで完全に収束しており、独立進化する理由がない。DRYの3+重複ルールに該当。

## Decision Drivers

- 3ツールのembeddingコードが99% 同一（mean_pooling, l2_normalize, ModelPaths, EmbedError, modernbert.rs, バックエンド実装）
- recallのort + Ruri v3移行（ADR-0031）を3回コピペしたくない
- rusqliteバージョンがドリフトしている（0.36/0.38/0.39）。統一が前提条件
- sqlite-vecのunsafe初期化コード（ensure_sqlite_vec）は1箇所で管理すべき

## Considered Options

### Option 1: rurico 共有クレート（git dep）（採用）

embedding + storageユーティリティを1クレートに抽出。各ツールはgit dependencyで参照。ローカル開発は `[patch]` でpath override。

- Good: embedding改善が1箇所で全ツールに伝播
- Good: リポジトリ構成を変えずに済む
- Good: `[patch]` でローカル開発は自動反映
- Good: unsafeコード（sqlite-vec初期化）を1箇所に集約
- Bad: `cargo update -p rurico` が必要（完全自動ではない）
- Bad: 新しいリポジトリの管理コスト

### Option 2: Cargo workspace（モノレポ）

全ツールを1リポジトリに統合。path dependencyで完全自動。

- Good: `cargo build` で常に最新。更新コマンド不要
- Good: `cargo test --workspace` で全ツール一括テスト
- Good: 依存バージョンの強制統一
- Bad: git history統合の移行コスト
- Bad: Issues/PR/CIの再構築
- Bad: Homebrew formula修正

### Option 3: コピーフォーク継続（現状維持）

各ツールが独自にコードを保持し続ける。

- Good: 移行コストゼロ
- Bad: recallのembedding刷新を3回コピペ
- Bad: rusqliteバージョンドリフトが拡大
- Bad: バグ修正の手動バックポート

## Decision Outcome

Option 1: ruricoを独立リポジトリとして作成し、git dependencyで参照。

前提条件としてrusqliteバージョンを0.39に統一（CP-012）。Embed traitは `&self` + `Send + Sync` で統一（yomuの `Arc<dyn Embed>` 並行アクセスを維持）。yomuのasync Embedは実態がsync（即座にresolveするfutureを返すだけ）のため、sync traitへの移行は安全。

## Technical Details

| Decision               | Choice                                                 | Rationale                                        |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| クレート数             | 1（rurico）                                            | embedding と storage util は消費者が同一         |
| Embed trait receiver   | `&self`                                                | yomu が `Arc<dyn Embed>` で並行アクセス          |
| Embed trait sync/async | sync                                                   | yomu の async は superficial（DA-V2 で検証済み） |
| 配布方式               | git dep + [patch]                                      | リポジトリ独立維持。ローカルは自動反映           |
| Feature flags          | mlx (default) / candle / test-support                  | 既存パターン踏襲                                 |
| storage scope          | ensure_sqlite_vec, f32_as_bytes, rrf_merge, fts_expand | open_db, schema, WAL recovery は各ツール固有     |
| 前提条件               | rusqlite 0.39 統一                                     | bundled SQLite の FFI 衝突回避（DA-V4）          |

## Links

- Cross-pollination: ~/.claude/workspace/references/cli-cross-pollination.md
- ADR-0031: ローカルembedding統一（ort + Ruri v3）
- ADR-0032: sae（esa semantic search CLI）
- ADR-0021: kiku（Slack semantic search）
- SOW/Spec: ~/.claude/workspace/planning/2026-03-24-rurico/
