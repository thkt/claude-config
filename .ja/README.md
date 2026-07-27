# Claude AI Configuration

Claude AI のためのカスタムコマンド、開発原則、ワークフロー最適化を含む包括的な設定システム。

📌 [English version](../README.md)

## 🎯 概要

このリポジトリは Claude AI のパーソナル設定を含み、以下を提供する。

- 体系的な開発ワークフローのためのカスタムスラッシュコマンド (26 skills)
- コードレビュー、生成、分析のための専門 AI エージェント (27 agents)
- AI 動作のコア原則と開発のベストプラクティス
- 品質パイプラインフック (guardrails, formatter, gates) と dormant な reviews コマンド
- 日本語サポート

## 📁 構造

```text
.claude/
├── CLAUDE.md             # メイン設定 (AI が読み込む)
├── README.md             # このファイル。クイックスタートガイド
├── rules/                # ルール定義
│   ├── core/             # AI 動作のコア原則
│   ├── conventions/      # ドキュメント規約
│   └── development/      # 開発パターン・方法論
├── skills/               # スキルベースのナレッジモジュール (26 skills)
├── agents/               # 専門 AI エージェント (27 agents)
│   ├── critics/          # 発見事項への反論 (devils-advocate)
│   ├── enhancers/        # コード改善・簡素化
│   ├── explorers/        # コードベース探索
│   ├── generators/       # テスト生成 (generator-test のみ)
│   ├── resolvers/        # ビルドエラー解決
│   └── reviewers/        # コードレビュー (18 reviewers)
├── docs/                 # 設計ドキュメント・ガイド (decisions/ に DR)
├── hooks/                # Pre/Post tool-use フック
├── output-styles/        # 出力スタイル定義
├── .claude-plugin/       # プラグインマーケットプレイス設定
└── .ja/                  # 日本語翻訳
```

## 🚀 クイックスタート

### Option 1: Claude Code プラグインとしてインストール (推奨)

このリポジトリは Claude Code プラグインとして提供されており、特定のワークフローセットを簡単にインストールできる。

1. このリポジトリをマーケットプレイスに追加する。

   ```bash
   /plugin marketplace add thkt/dotclaude
   ```

2. 利用可能なプラグインを確認する。

   ```bash
   /plugin
   ```

3. プラグインをインストールする。

   ```bash
   /plugin install build
   ```

利用可能なプラグイン:

- build: 自己完結の開発ワークフロー一式。install 時にリポジトリ全体を一度 clone し、全 skill / agent / workflow を build: namespace でロードする。/issue で起票した issue の番号を build workflow に渡す。build は Load / Revalidate / Branch / Code / Cleanup / Verify / Ship を実行して draft PR を作る。/audit と /polish は draft PR に対して人間が個別に起動する。同梱対象は planning 系 (/think, /research, /slice, /outcome)、reviewer / critic エージェント、code / audit / polish / shake / assert / adrift workflow。git 系 (/commit, /checkout, /pr) と /dr、/census も含む

### Option 2: 手動インストール (フル設定)

これを個人の `.claude` 設定として使う場合。

1. リポジトリをホームディレクトリにクローンする。

   ```bash
   git clone https://github.com/thkt/dotclaude.git ~/.claude
   ```

2. 既存の `.claude` ディレクトリがある場合は先にバックアップする。

   ```bash
   mv ~/.claude ~/.claude.backup
   git clone https://github.com/thkt/dotclaude.git ~/.claude
   ```

注意: 手動インストールには、すべてのコマンド、エージェント、ルール、個人設定が含まれる。プラグインインストールでは共有コマンドとエージェントのみが含まれ、個人の `CLAUDE.md`、`rules/`、`settings.json` は除外される。

## 📦 依存関係とセットアップ

### Sandbox 機能 (任意。推奨)

Claude Code の sandbox 機能は、自動的なパーミッション処理を伴う安全なコマンド実行を提供し、安全性を保ちつつ承認の手間を減らす。

システム要件:

- macOS または Linux (Windows は未対応)
- npm/npx 付きの Node.js
- ripgrep (通常はプリインストール済み)
- jq (現行フックで必須): `brew install jq`

セットアップ:

```bash
# 1. sandbox runtime のインストール
npm install -g @anthropic-ai/sandbox-runtime

# 2. インストール確認
srt --version

# 3. Claude Code で有効化
# Claude Code セッション内で以下を実行:
/sandbox
# Option 1: "Sandbox BashTool, with auto-allow in accept edits mode" を選択
```

機能:

- ✅ ファイルシステムアクセスを許可ディレクトリに制限
- ✅ プロキシ経由のネットワークアクセス制御
- ✅ 安全なコマンドを sandbox 内で自動実行
- ✅ sandbox 制限に抵触したときのみ承認を要求

設定 (任意):

カスタム設定のために `~/.srt-settings.json` を作成する。

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "excludedCommands": ["docker"],
    "network": {
      "allowLocalBinding": true,
      "httpProxyPort": 8080
    }
  }
}
```

build workflow は `gh` を sandbox 内で実行する。macOS で sandbox を有効にしている場合、`gh` の TLS 検証に `~/.claude/settings.json` の `sandbox.enableWeakerNetworkIsolation: true` が必要になる。未設定だと build が issue 取得段で失敗する。

### Hook ツール (推奨)

`settings.json` に配線された品質パイプラインフックは Claude Code セッション中に自動実行され、lint エラーを検出し、コードを整形し、品質ゲートを強制する。reviews はインストール対象だが `settings.json` に配線されておらず、自動実行されない。

```bash
brew tap thkt/tap
brew install guardrails formatter reviews gates
```

| ツール     | フック      | タイミング      | 役割                                 |
| ---------- | ----------- | --------------- | ------------------------------------ |
| guardrails | PreToolUse  | Write/Edit 前   | Lint (oxlint) + セキュリティチェック |
| formatter  | PostToolUse | Write/Edit 後   | 自動整形 (oxfmt)                     |
| reviews    | 未配線      | 自動実行なし    | 静的解析コマンド (dormant)           |
| gates      | PostToolUse | Write/Edit/Bash 後 | 品質ゲート (knip, tsgo, madge)     |

プロジェクト単位の設定は `.claude/tools.json` で行う。詳細は [thkt/tap](https://github.com/thkt/homebrew-tap) を参照。

### 外部 CLI ツール (任意)

一部のコマンドはデータソース連携のために外部 CLI を使う。

| ツール  | 利用コマンド                       | 用途                 | インストール                       |
| ------- | ---------------------------------- | -------------------- | ---------------------------------- |
| `gh`    | `/issue`, `/pr`, `/preview`, `/build` | GitHub API アクセス | `brew install gh && gh auth login` |
| `scout` | Slack URL 読み込み                 | Slack メッセージ取得 | `brew install thkt/tap/scout`      |

Slack 読み込み: `scout fetch <slack-url>` で任意の Slack メッセージ/スレッド URL を直接読み込む。scout が設定済みなら追加設定は不要。

### 自律反復

`/code` は native `/goal` コマンド (Claude Code 2.1.139+) で自律的なマルチターンループとして実行できる。プラグインのインストールは不要。

## 📝 利用可能なコマンド

完全なコマンドリファレンスを参照する。

- [English Command Reference](../docs/COMMANDS.md)
- [日本語コマンドリファレンス](./docs/COMMANDS.md)

## 🔄 標準ワークフロー

### 機能開発 (Enhanced)

```txt
/research → /think → /code → /audit
```

### バグ調査と修正

```txt
/research → /fix
```

## 🌏 言語サポート

- AI 処理: 内部は英語
- ユーザー出力: 日本語 (設定可能)
- ドキュメント: README.md と docs/*.md は英語・日本語の両方を提供。docs/wiki/*.md の 5 件は英語のみ

## 🛠️ 主要機能

### コア AI 原則

- Safety First: ファイル削除はゴミ箱 (`~/.Trash/`) を使用。破壊的操作は確認を要求
- User Authority: ユーザー指示が最終権威
- Output Verifiability: 正確な書式はファイルで確認し、未読コードを断定しない。検証が不可欠な知識ギャップでは作業を止める

### 開発アプローチ

- Occam's Razor: 動く中で最も簡潔な解決策を選ぶ
- Progressive Enhancement: シンプルに作り、段階的に拡張する
- TDD/RGRC: 信頼性のあるコードのための Red-Green-Refactor-Commit サイクル

詳細: [PRINCIPLES.md](./rules/PRINCIPLES.md)

## 📚 ドキュメント

### コアドキュメント

- [Design Philosophy](./docs/DESIGN.md). 設計思想・意図
- [Commands Reference (English)](../docs/COMMANDS.md)
- [Commands Reference (Japanese)](./docs/COMMANDS.md)
- [Configuration Guide](../CLAUDE.md)
- [Japanese Configuration](./CLAUDE.md)

### 開発ガイド

- [Principles Guide](./rules/PRINCIPLES.md). 全開発原則の概要
- [Markdown Conventions](./rules/conventions/MARKDOWN.md). Markdown 記述・参照ルール

## 🤝 コントリビュート

自由にこのリポジトリを fork してニーズに合わせてカスタマイズしてください。改善のためのプルリクエストも歓迎する。

## 📜 ライセンス

MIT License. 自由に利用、改変できる。

## 👤 著者

thkt

---

_この設定は、品質、可読性、保守性に焦点を当てた体系的なソフトウェア開発のために Claude AI の能力を高める。_
