# エージェント構成サマリー

## 概要

~/.claude/agents/ には14のレビューエージェントが定義されています。
各エージェントは専門分野を持ち、コードレビューの異なる側面を担当します。

## エージェント一覧

### オーケストレーター（統括）

| エージェント名 | モデル | 色 | 役割 |
|-------------|--------|-----|------|
| review-orchestrator | opus | indigo | レビュー全体の統括・優先度付け・結果統合 |

### フロントエンドレビューアー

| エージェント名 | モデル | 色 | 専門分野 |
|-------------|--------|-----|----------|
| readability-reviewer | sonnet | cyan | コード可読性・The Art of Readable Code原則 |
| structure-reviewer | sonnet | magenta | コード構造・無駄・重複・根本的問題解決 |
| root-cause-reviewer | opus | red | 根本原因分析・深い問題解決 |
| type-safety-reviewer | sonnet | cyan | TypeScript型安全性・型カバレッジ |
| performance-reviewer | sonnet | orange | パフォーマンス最適化・バンドルサイズ |
| security-reviewer | sonnet | yellow | セキュリティ脆弱性・XSS・OWASP Top 10 |
| accessibility-reviewer | sonnet | pink | WCAG準拠・アクセシビリティ |
| design-pattern-reviewer | sonnet | purple | React設計パターン・Container/Presentational |
| testability-reviewer | sonnet | green | テスタビリティ・依存性注入・純粋関数 |

### 汎用レビューアー

| エージェント名 | モデル | 色 | 専門分野 |
|-------------|--------|-----|----------|
| progressive-enhancer | sonnet | lime | プログレッシブエンハンスメント・CSS-first |
| document-reviewer | sonnet | brown | 技術文書品質・README・API仕様書 |
| subagent-reviewer | opus | gray | エージェント定義ファイルのメタレビュー |

## モデル選択基準

- **opus (4エージェント)**: 複雑な推論・深い分析が必要なタスク
  - review-orchestrator: 統括・優先度判断
  - root-cause-reviewer: 根本原因分析
  - subagent-reviewer: メタレビュー

- **sonnet (10エージェント)**: パターン認識・構造分析タスク
  - 可読性、構造、型安全性などの具体的なパターンチェック

## 実行フェーズ

### Phase 1: 基礎レビュー
1. structure-reviewer - コード構造とDRY原則
2. readability-reviewer - コード明瞭性と保守性
3. root-cause-reviewer - 問題分析と解決策
4. progressive-enhancer - CSS-firstアプローチと簡素化

### Phase 2: 品質レビュー
1. type-safety-reviewer - TypeScript使用と型カバレッジ
2. design-pattern-reviewer - アーキテクチャとパターン
3. testability-reviewer - テストしやすい設計
4. document-reviewer - ドキュメント品質（.mdファイルがある場合）

### Phase 3: 本番対応レビュー
1. performance-reviewer - ランタイムとビルド最適化
2. security-reviewer - セキュリティ脆弱性
3. accessibility-reviewer - WCAG準拠と使いやすさ

## コマンドとの統合

### `/review` コマンド
- 全レビューエージェントを自動的に選択・実行
- ファイルタイプに応じて適切なエージェントを選択
- .mdファイルがある場合はdocument-reviewerを自動追加

### 条件付き実行
```typescript
// .mdファイルがある場合のみdocument-reviewerを実行
if (context.targetFiles.some(f => f.endsWith('.md'))) {
  conditionalAgents.push('document-reviewer');
}
```

## 未使用エージェントの活用提案

### document-reviewer
- **現在**: `/review`コマンドで.mdファイル検出時に自動実行
- **将来**: ドキュメント変更時の自動トリガー

### subagent-reviewer
- **用途**: エージェント定義ファイルの検証
- **提案**: `/review-agents` コマンドの新設

## 色の意味的関連付け

| 色 | 意味 | 使用エージェント |
|-----|------|----------------|
| indigo | リーダーシップ・統括 | review-orchestrator |
| cyan | 明瞭性・透明性 | readability-reviewer, type-safety-reviewer |
| magenta | アーキテクチャ・構造 | structure-reviewer |
| red | 重要・深い分析 | root-cause-reviewer |
| orange | スピード・最適化 | performance-reviewer |
| yellow | 警告・セキュリティ | security-reviewer |
| pink | インクルーシブデザイン | accessibility-reviewer |
| purple | パターン・設計 | design-pattern-reviewer |
| green | テスト・成功 | testability-reviewer |
| lime | 成長・向上 | progressive-enhancer |
| brown | ドキュメント・紙 | document-reviewer |
| gray | メタ・中立 | subagent-reviewer |

## 出力フォーマット

全エージェントは以下のルールに従います：
1. **テンプレート**: 英語で定義
2. **出力**: 日本語に翻訳（CLAUDE.md P1ルール）
3. **メトリクス**: 定量的評価を含む
4. **優先度**: Critical/High/Medium/Low で分類

## 今後の改善提案

1. **自動トリガー設定**: settings.jsonにフック追加
2. **`/review-agents` コマンド**: エージェント管理用
3. **カバレッジ追跡**: 各エージェントの利用頻度分析
4. **カスタムルール**: プロジェクト固有のレビュールール対応
