---
name: search
description: Gemini CLIを使用してGoogle検索を実行
priority: medium
suitable_for:
  scale: [small, medium, large]
  type: [research, exploration]
  understanding: "any"
  urgency: [low, medium, high]
aliases: [gsearch, google]
timeout: 30
context:
  files_changed: "none"
  lines_changed: "0"
  new_features: false
  breaking_changes: false
---

# /gemini:search - Gemini経由のGoogle検索

## 目的

Gemini CLIを使用してGoogle検索を実行し、AI支援による包括的な結果を取得します。

## 使用方法

検索したい内容を説明してください：

- 「最新のReactパフォーマンス最適化技術」
- 「TypeScript 5.0の新機能」
- 「2024年のAPIセキュリティベストプラクティス」

## 実行戦略

### 1. クエリ最適化

- より良い結果のための検索語句の強化
- 関連キーワードと時間枠の追加
- 権威あるソースに焦点

### 2. Gemini経由の検索

```bash
gemini --prompt "検索して要約: {{query}}
焦点：
- 最新情報（最近のソースを優先）
- 権威あるソース
- 実用的な例
- 主要な洞察とトレンド"
```

### 3. TodoWrite統合

検索進捗を追跡：

```markdown
# 検索: [トピック]
1. ⏳ 検索実行
2. ⏳ 結果分析
3. ⏳ 重要な発見の抽出
```

## 検索タイプ

### 技術調査

```bash
gemini -p "技術検索: {{query}}
含める：
- 公式ドキュメント
- GitHubリポジトリ
- Stack Overflowの解決策
- 技術ブログ記事"
```

### ベストプラクティス

```bash
gemini -p "ベストプラクティス検索: {{query}}
焦点：
- 業界標準
- 専門家の推奨事項
- ケーススタディ
- よくある落とし穴"
```

### トラブルシューティング

```bash
gemini -p "トラブルシューティング検索: {{query}}
検索：
- 一般的な原因
- 解決アプローチ
- 類似の問題
- 回避策"
```

## 出力フォーマット

```markdown
## 検索結果: [クエリ]

### 主要な発見
- [主な洞察1]
- [主な洞察2]
- [主な洞察3]

### 関連ソース
1. [簡単な説明付きのソース]
2. [簡単な説明付きのソース]

### 推奨アクション
- [発見に基づく次のステップ]
```

## 使用する場合

- 新技術の調査
- ベストプラクティスの検索
- エラーのトラブルシューティング
- 実装アプローチの探索
- トレンドの把握

## 使用しない場合

- 単純な事実確認（WebSearchを使用）
- ローカルコードベース検索（Grep/Globを使用）
- APIドキュメント（公式ドキュメントを使用）

## 使用例

```markdown
/gemini:search "React Server Components本番デプロイ"
/gemini:search "GraphQLのN+1クエリ問題の解決"
/gemini:search "Kubernetes自動スケーリングベストプラクティス2024"
```

## ヒント

1. **具体的に** - コンテキストと制約を含める
2. **時間枠を追加** - 「2024年」、「最新」、「最近」
3. **ドメインを指定** - 「TypeScript」、「React」、「Node.js」
4. **形式をリクエスト** - 「例付き」、「ステップバイステップ」

## 前提条件

- Gemini CLIがインストールされ設定済み
- インターネット接続
- 有効なGemini API資格情報

## 次のステップ

- 有望な発見 → `/research` で深堀り
- 実装アイデア → `/think` で計画
- クイック修正が見つかった → `/fix` で適用
