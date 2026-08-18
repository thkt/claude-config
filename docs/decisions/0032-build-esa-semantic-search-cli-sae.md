---
status: "proposed"
date: 2026-03-23
decision-makers: thkt
---

# ADR-0032: Build esa semantic search CLI (sae)

## Context and Problem Statement

esa をナレッジハブとして使っているが、検索がキーワードベースのため「あの話どこに書いたっけ」をキーワードなしで見つけられない。esa 公式 MCP（@esaio/esa-mcp-server）は記事 CRUD を提供するが、セマンティック検索はない。kiku（ADR-0021）が Slack に対して提供するのと同じ概念発見能力を、esa に対して提供する。

sae = esa のアナグラム。冴え（sharpness/clarity）。

## Decision Drivers

- キーワード不要の概念ベース検索が必須（esa 検索では不可）
- kiku/yomu で実証済みのアーキテクチャ（SQLite + sqlite-vec）を活用
- ローカル embedding 統一方針（ADR-0031）に準拠
- esa MCP と共存（CRUD は CLI でも提供、検索は CLI のみ）
- 日本語テキストの FTS5 対応（trigram tokenizer）

## Considered Options

### Option 1: sae - kiku/yomu コピーフォークによる Rust CLI（採用）

kiku のアーキテクチャをコピーフォークし、データソースを esa API に置換。FTS5 trigram + semantic hybrid 検索。Embed trait で embedding backend を抽象化し、recall 完成後にローカル backend（ort + Ruri v3）に統一。

- Good: kiku/yomu で実証済みの sqlite-vec パターンを再利用
- Good: FTS5 trigram で日本語部分文字列マッチが可能
- Good: Embed trait でローカル embedding 移行が容易
- Good: 記事 CRUD も CLI から直接操作可能
- Bad: esa API が page-based pagination のため sync に欠落リスク（gap detection で緩和）
- Bad: recall の embedder 未完成のため初期 backend が暫定
- Bad: FTS5 trigram はインデックスサイズが大きい（ナレッジベース規模では許容範囲）

### Option 2: esa MCP の拡張（検索機能追加）

公式 MCP にセマンティック検索を追加するプラグインまたはフォーク。

- Good: 既存 MCP エコシステムとの統合
- Bad: MCP プロセスに embedding + SQLite を組み込む複雑性
- Bad: 公式 MCP の更新に追従するメンテナンスコスト
- Bad: ローカル embedding 方針との整合が困難（MCP はプロセス分離）

### Option 3: esa 検索のみ利用（ツールなし）

esa のキーワード検索で運用を続ける。

- Bad: キーワード前提で概念発見ができない（致命的）
- Bad: esa 内の知識が埋もれ続ける

## Decision Outcome

Option 1: sae を kiku/yomu コピーフォークとして構築。

esa API page-based pagination の欠落リスクは gap detection（total_count 比較 + 差分補完）で緩和。FTS5 は trigram tokenizer で日本語対応。embedding backend は Embed trait で抽象化し、recall 完成後に ort + Ruri v3 へ差替。

## Technical Details

| Decision          | Choice                                               | Rationale                                           |
| ----------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Embedding backend | Embed trait（recall 準拠）                           | ローカル完結方針（ADR-0031）                        |
| Search strategy   | FTS5 trigram + fts5vocab expansion + semantic hybrid | 1〜2文字クエリは fts5vocab 前方一致 → OR 展開で対応 |
| Chunk unit        | Markdown heading sections                            | 長文記事の検索精度確保                              |
| Sync              | page-based + gap detection                           | esa API 制約 + DA 指摘反映                          |
| DB                | team 別独立 DB                                       | multi-team 分離性                                   |
| CRUD              | esa API direct                                       | MCP 不要、CLI で完結                                |

## Links

- SOW: ~/.claude/workspace/planning/2026-03-23-sae/sow.md
- Spec: ~/.claude/workspace/planning/2026-03-23-sae/spec.md
- ADR-0021: kiku（Slack semantic search）
- ADR-0031: ローカル embedding 統一（ort + Ruri v3）
- esa API: <https://docs.esa.io/posts/102>
- FTS5 trigram + fts5vocab: <https://www.space-i.com/post-blog/sqlite-fts-trigram-tokenizer%E3%81%A7unigram%EF%BC%86bigram%E6%A4%9C%E7%B4%A2%E3%81%BE%E3%81%A7%E3%82%B5%E3%83%9D%E3%83%BC%E3%83%88-%E6%97%A5%E6%9C%AC%E8%AA%9E%E5%85%A8%E6%96%87%E6%A4%9C%E7%B4%A2/>

## Reassessment Triggers

- esa API が page-based pagination をやめ、gap detection が不要または無効になったとき
- kiku と yomu からのコピーフォーク 3 本が乖離し、共有クレート化の利得が上回ったとき
