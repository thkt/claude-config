# CLI Tools

Claude Code の機能を拡張する外部 CLI ツール。

📌 [English version](../../docs/CLI_TOOLS.md)

## 概要

4 つの Rust CLI ツール (scout, recall, sae, xr)。それぞれ Claude Code のデフォルト ツールに対する特定のギャップを埋めるために作られている。本ドキュメントは設計意図とアーキテクチャを扱う。

```mermaid
graph LR
    subgraph Search["Information Retrieval"]
        SC[scout]
        RE[recall]
        SAE[sae]
        XR[xr]
    end

    SC -->|Web + GitHub| AI[Claude Code]
    RE -->|Past Sessions| AI
    SAE -->|esa Posts| AI
    XR -->|X/Twitter| AI
```

## scout

Brave Search API による Web 検索とページ取得。

| 観点    | 詳細                                                       |
| ------- | ---------------------------------------------------------- |
| Why     | WebFetch/WebSearch はトークンを消費し、Markdown 変換が弱い |
| How     | 検索は Brave Search API、ページ抽出は readability           |
| Install | `brew install thkt/tap/scout`                              |
| Source  | [thkt/scout](https://github.com/thkt/scout)                |

### コマンド

| コマンド              | 用途                                          |
| --------------------- | --------------------------------------------- |
| `scout search`        | Web 検索 (Brave Search API)                   |
| `scout fetch`         | URL をクリーンな Markdown として取得          |
| `scout research`      | 深いリサーチ (検索 + 取得 + 編集)             |
| `scout repo-overview` | GitHub リポジトリ概要 (stars, issues, README) |
| `scout repo-tree`     | リモート GitHub リポジトリのファイル一覧      |
| `scout repo-read`     | リモート GitHub リポジトリからファイルを読む  |

### 適用条件

| scout                            | WebFetch/WebSearch  |
| -------------------------------- | ------------------- |
| 最新ドキュメント、リリースノート | 不可 (scout を優先) |
| GitHub リポジトリ探索            | 不可 (scout を優先) |
| 編集付きの深いリサーチ           | N/A                 |

## recall

過去の Claude Code・Codex セッションを横断する全文検索 (FTS5 ベースの SQLite インデックス)。

| 観点    | 詳細                                                  |
| ------- | ----------------------------------------------------- |
| Why     | JSONL のセッション履歴はデフォルトで検索できない      |
| How     | セッション トランスクリプトに対する FTS5 インデックス |
| Install | `brew install thkt/tap/recall`                        |
| Source  | [thkt/recall](https://github.com/thkt/recall)         |

### コマンド

| コマンド                                  | 用途                              |
| ----------------------------------------- | --------------------------------- |
| `recall search "query"`                   | セッション横断の全文検索          |
| `recall search --days N "query"`          | 直近 N 日にフィルタ               |
| `recall search --project <PATH> "query"`  | プロジェクト パスでフィルタ       |
| `recall search --source <SOURCE> "query"` | ソースでフィルタ (claude / codex) |
| `recall index`                            | 新規セッションログを増分 index    |
| `recall rebuild`                          | 全セッションを再解析・再 index    |

### 適用条件

| recall                                | Grep *.jsonl                  |
| ------------------------------------- | ----------------------------- |
| 過去の解: `how did I fix X`           | 現セッションのみ              |
| パターン想起: `what tool for Y`       | 既知の特定セッション ファイル |
| プロジェクト横断: `where did I use Z` |                               |

## sae

esa 記事の semantic search と読み取り。`settings.json` は read-only の `search`、`status`、`get` を許可する。

### コマンド

| コマンド             | 用途                             |
| -------------------- | -------------------------------- |
| `sae search "query"` | index 済み記事の semantic search |
| `sae status`         | 同期・index 状態の表示           |
| `sae get <NUMBER>`   | 記事番号による取得               |

## xr

X/Twitter コンテンツの取得 (tweet, thread, article, user profile)。

| 観点    | 詳細                                                      |
| ------- | --------------------------------------------------------- |
| Why     | scout fetch は X/Twitter の構造化コンテンツを抽出できない |
| How     | tweet/thread/article/profile 取得のための X/Twitter API   |
| Install | `brew install thkt/tap/xr`                                |

### コマンド

| コマンド                      | 用途                        |
| ----------------------------- | --------------------------- |
| `xr tweet <url>`              | 単一ツイートの取得          |
| `xr tweet <url> --thread`     | スレッド付きツイートの取得  |
| `xr article <url>`            | X article の取得            |
| `xr user <screen_name>`       | ユーザー プロフィールの取得 |
| `xr feed`                     | ホーム timeline の取得      |
| `xr user-posts <screen_name>` | ユーザーの投稿一覧を取得    |

### 適用条件

| xr                                | scout fetch        |
| --------------------------------- | ------------------ |
| x.com / twitter.com URL           | その他すべての URL |
| スレッド/返信のコンテキストが必要 | N/A                |
| ユーザー プロフィール検索         | N/A                |

## 関連

- [HOOKS.md](./HOOKS.md). Hook システム設計 (品質パイプラインを含む)
