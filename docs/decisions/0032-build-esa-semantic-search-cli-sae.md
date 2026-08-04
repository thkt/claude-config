---
status: "proposed"
date: 2026-03-23
decision-makers: thkt
---

# ADR-0032: Build esa semantic search CLI (sae)

## Context and Problem Statement

esaをナレッジハブとして使っているが、検索がキーワードベースのため「あの話どこに書いたっけ」をキーワードなしで見つけられない。esa公式MCP（@esaio/esa-mcp-server）は記事CRUDを提供するが、セマンティック検索はない。kiku（ADR-0021）がSlackに対して提供するのと同じ概念発見能力を、esaに対して提供する。

sae = esaのアナグラム。冴え（sharpness/clarity）。

## Decision Drivers

- キーワード不要の概念ベース検索が必須（esa検索では不可）
- kiku/yomuで実証済みのアーキテクチャ（SQLite + sqlite-vec）を活用
- ローカルembedding統一方針（ADR-0031）に準拠
- esa MCPと共存（CRUDはCLIでも提供、検索はCLIのみ）
- 日本語テキストのFTS5対応（trigram tokenizer）

## Considered Options

### Option 1: sae - kiku/yomu コピーフォークによる Rust CLI（採用）

kikuのアーキテクチャをコピーフォークし、データソースをesa APIに置換。FTS5 trigram + semantic hybrid検索。Embed traitでembedding backendを抽象化し、recall完成後にローカルbackend（ort + Ruri v3）に統一。

- Good: kiku/yomuで実証済みのsqlite-vecパターンを再利用
- Good: FTS5 trigramで日本語部分文字列マッチが可能
- Good: Embed traitでローカルembedding移行が容易
- Good: 記事CRUDもCLIから直接操作可能
- Bad: esa APIがpage-based paginationのためsyncに欠落リスク（gap detectionで緩和）
- Bad: recallのembedder未完成のため初期backendが暫定
- Bad: FTS5 trigramはインデックスサイズが大きい（ナレッジベース規模では許容範囲）

### Option 2: esa MCP の拡張（検索機能追加）

公式MCPにセマンティック検索を追加するプラグインまたはフォーク。

- Good: 既存MCPエコシステムとの統合
- Bad: MCPプロセスにembedding + SQLiteを組み込む複雑性
- Bad: 公式MCPの更新に追従するメンテナンスコスト
- Bad: ローカルembedding方針との整合が困難（MCPはプロセス分離）

### Option 3: esa 検索のみ利用（ツールなし）

esaのキーワード検索で運用を続ける。

- Bad: キーワード前提で概念発見ができない（致命的）
- Bad: esa内の知識が埋もれ続ける

## Decision Outcome

Option 1: saeをkiku/yomuコピーフォークとして構築。

esa API page-based paginationの欠落リスクはgap detection（total_count比較 + 差分補完）で緩和。FTS5はtrigram tokenizerで日本語対応。embedding backendはEmbed traitで抽象化し、recall完成後にort + Ruri v3へ差替。

## Technical Details

| Decision              | Choice                        | Rationale                              |
| --------------------- | ----------------------------- | -------------------------------------- |
| Embedding backend     | Embed trait（recall 準拠）    | ローカル完結方針（ADR-0031）           |
| Search strategy       | FTS5 trigram + fts5vocab expansion + semantic hybrid | 1-2文字クエリは fts5vocab 前方一致 → OR 展開で対応 |
| Chunk unit            | Markdown heading sections     | 長文記事の検索精度確保                 |
| Sync                  | page-based + gap detection    | esa API 制約 + DA 指摘反映             |
| DB                    | team 別独立 DB                | multi-team 分離性                      |
| CRUD                  | esa API direct                | MCP 不要、CLI で完結                   |

## Links

- SOW: ~/.claude/workspace/planning/2026-03-23-sae/sow.md
- Spec: ~/.claude/workspace/planning/2026-03-23-sae/spec.md
- ADR-0021: kiku（Slack semantic search）
- ADR-0031: ローカルembedding統一（ort + Ruri v3）
- esa API: <https://docs.esa.io/posts/102>
- FTS5 trigram + fts5vocab: <https://www.space-i.com/post-blog/sqlite-fts-trigram-tokenizer%E3%81%A7unigram%EF%BC%86bigram%E6%A4%9C%E7%B4%A2%E3%81%BE%E3%81%A7%E3%82%B5%E3%83%9D%E3%83%BC%E3%83%88-%E6%97%A5%E6%9C%AC%E8%AA%9E%E5%85%A8%E6%96%87%E6%A4%9C%E7%B4%A2/>
