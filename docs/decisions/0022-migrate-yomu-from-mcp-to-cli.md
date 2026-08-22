---
status: "proposed"
date: 2026-03-04
decision-makers: thkt
---

# ADR-0022: Migrate yomu from MCP server to CLI tool

## Context and Problem Statement

yomu は ADR-0017 で MCP サーバーとして設計・構築されたが、運用を通じて MCP プロトコルが yomu のユースケースにおいて不要なオーバーヘッドであることが判明した。

Eric Holmes の記事 "MCP is dead. Long live the CLI" が示す通り:

1. LLM は CLI ツールの使い方に元々精通している（man page, --help で十分）
2. CLI は composable, debuggable で、人間と機械の両方が使える
3. MCP は auth, プロセス管理, 初期化の不安定さなど実務上の摩擦がある

yomu 固有の状況:

- local-only ツール → MCP の auth メリットなし
- 主たる消費者は Claude Code → Bash ツールで呼べる
- MCP ツール定義の自動ロードは CLAUDE.md 指示で代替可能
- 出力は既にテキスト → stdout に出すだけで同等

## Decision Drivers

- LLM エージェントとの親和性（CLI > MCP の主張に同意）
- 依存の簡素化（rmcp, schemars 除去）
- デバッグ容易性（同じコマンドを人間が実行可能）
- プロセス管理不要（MCP サーバーの起動・死活管理が消える）
- 他の AI ツールとの互換性（MCP 非対応ツールでも CLI なら使える）

## Considered Options

### Option 1: Pure CLI（MCP 完全削除）

MCP サーバーを廃止し、clap ベースの CLI サブコマンドに置き換える。

- Good: 最もシンプル。依存最小
- Good: rmcp/schemars 削除でコンパイル時間・バイナリサイズ削減
- Good: プロセス管理不要
- Bad: MCP ユーザーに breaking change
- Bad: MCP ツール定義の自動ロードがなくなる

### Option 2: CLI primary + `yomu mcp` サブコマンド

CLI をデフォルトにしつつ、`yomu mcp` で既存 MCP サーバーモードを維持。

- Good: 後方互換（MCP config を `"args": ["mcp"]` に変更するだけ）
- Good: 移行期間を設けられる
- Bad: rmcp/schemars が依存に残る（コンパイル時間・バイナリサイズ）
- Bad: 2 つのインターフェースを維持するコスト

### Option 3: CLI + MCP を feature flag で切り替え

`cargo build --features mcp` で MCP サブコマンドを有効化。

- Good: CLI-only ビルドは軽量
- Good: MCP が必要なユーザーは opt-in
- Bad: ビルド設定が複雑化
- Bad: 両モードのテスト・メンテナンスコスト
- Bad: 現時点で MCP ユーザーが限定的なのに過剰設計

## Decision Outcome

Chosen option: Option 1 (Pure CLI)

Occam's Razor:
MCP の利点が yomu では薄く、CLI で同等の機能を提供できる。YAGNI: 後方互換や feature
flag は、MCP が必要になった時点で追加すればよい。

### Positive Consequences

- 依存 2 crate 削減（rmcp, schemars）
- MCP サーバーの起動・プロセス管理が不要に
- 人間が同じコマンドでデバッグ可能
- MCP 非対応の AI ツールでも利用可能
- Claude Code の Bash パーミッション制御の恩恵を受けられる

### Negative Consequences

- homebrew ユーザーへの breaking change（0.4.0 semver bump で対応）
- CLAUDE.md / MCP 設定の更新が必要

## Migration Strategy

1. 0.4.0 リリースで CLI に切り替え
2. CHANGELOG に MCP → CLI 移行手順を記載
3. README を CLI セットアップに更新
4. .mcp.json から yomu エントリを削除
5. TOOLS.md (EN/JA) を CLI コマンドに更新
6. architect-feature.md (EN/JA) の yomu 参照を CLI に更新、tools に Bash を追加

## Success Criteria

- `cargo test` 全テスト pass
- `yomu search` が既存 `explorer` MCP ツールと同等の出力を返す
- Claude Code から Bash 経由で全サブコマンドが利用可能

## Reassessment Triggers

- MCP でしか成立しない consumer (エディタ統合など) が現れたとき
- CLI の起動コストが繰り返し呼び出しで無視できなくなったとき
