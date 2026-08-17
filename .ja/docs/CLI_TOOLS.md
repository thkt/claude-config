# CLI Tools

Claude Code の機能を拡張する外部 CLI ツール。

📌 [English version](../../docs/CLI_TOOLS.md)

## 概要

4 つの Rust CLI ツール (scout, recall, sae, xr)。それぞれ Claude Code のデフォルトツールに対する特定のギャップを埋めるために作られている。本ドキュメントは設計意図とアーキテクチャを扱う。

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

Web 検索、ページ取得、GitHub リポジトリ探索。検索系 (`search`、`research`) だけが Brave Search API を使い、`BRAVE_SEARCH_API_KEY` を要求する。`fetch` と `repo-*` は key 無しで動く。

| 観点    | 詳細                                                       |
| ------- | ---------------------------------------------------------- |
| Why     | WebFetch/WebSearch はトークンを消費し、Markdown 変換が弱い |
| How     | 検索は Brave Search API、ページ抽出は readability          |
| Install | `brew install thkt/tap/scout`                              |
| Source  | [thkt/scout](https://github.com/thkt/scout)                |

### コマンド

正典は use-cli-scout skill と `scout --help`。下表はその抜粋。

| コマンド              | 用途                                          |
| --------------------- | --------------------------------------------- |
| `scout search`        | Web 検索 (Brave Search API)                   |
| `scout fetch`         | URL をクリーンな Markdown として取得          |
| `scout research`      | 深いリサーチ (検索 + 取得 + 編集)             |
| `scout repo-overview` | GitHub リポジトリ概要 (stars, issues, README) |
| `scout repo-tree`     | リモート GitHub リポジトリのファイル一覧      |
| `scout repo-read`     | リモート GitHub リポジトリからファイルを読む  |

### 適用条件

Web 上の情報を読むときは scout を使う。最新ドキュメント、リリースノート、GitHub リポジトリ探索が対象で、深いリサーチは scout research が担う。scout で読めなければ、その API 使用や claim は `unverified` として扱う ([SOURCING.md](../rules/development/SOURCING.md))。

## recall

過去の Claude Code・Codex セッションを横断する全文検索 (FTS5 ベースの SQLite インデックス)。

| 観点    | 詳細                                                 |
| ------- | ---------------------------------------------------- |
| Why     | JSONL のセッション履歴はデフォルトで検索できない     |
| How     | セッショントランスクリプトに対する FTS5 インデックス |
| Install | `brew install thkt/tap/recall`                       |
| Source  | [thkt/recall](https://github.com/thkt/recall)        |

### コマンド

正典は use-cli-recall skill と `recall --help`。下表はその抜粋。

| コマンド                                  | 用途                            |
| ----------------------------------------- | ------------------------------- |
| `recall search "query"`                   | セッション横断の全文検索        |
| `recall search --days N "query"`          | 直近 N 日にフィルタ             |
| `recall search --project <PATH> "query"`  | プロジェクトパスでフィルタ      |
| `recall search --source <SOURCE> "query"` | ソースでフィルタ (claude/codex) |
| `recall index`                            | 新規セッションログを増分 index  |
| `recall rebuild`                          | 全セッションを再解析・再 index  |

### 適用条件

| recall                                | Grep \*.jsonl                |
| ------------------------------------- | ---------------------------- |
| 過去の解: `how did I fix X`           | 現セッションのみ             |
| パターン想起: `what tool for Y`       | 既知の特定セッションファイル |
| プロジェクト横断: `where did I use Z` |                              |

## sae

esa 記事の semantic search と読み取り。`settings.json` は read-only の `search`、`status`、`get` を許可する。

### コマンド

正典は `sae --help`。下表は `settings.json` が許可する読み取り 3 コマンド。

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

| コマンド                      | 用途                       |
| ----------------------------- | -------------------------- |
| `xr tweet <url>`              | 単一ツイートの取得         |
| `xr tweet <url> --thread`     | スレッド付きツイートの取得 |
| `xr article <url>`            | X article の取得           |
| `xr user <screen_name>`       | ユーザープロフィールの取得 |
| `xr feed`                     | ホーム timeline の取得     |
| `xr user-posts <screen_name>` | ユーザーの投稿一覧を取得   |

### 適用条件

| xr                                | scout fetch        |
| --------------------------------- | ------------------ |
| x.com/twitter.com URL             | その他すべての URL |
| スレッド/返信のコンテキストが必要 | N/A                |
| ユーザープロフィール検索          | N/A                |

## 関連

- [HOOKS.md](./HOOKS.md). Hook システム設計 (品質パイプラインを含む)
