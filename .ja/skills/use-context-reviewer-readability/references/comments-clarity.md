# コメントとコードの明瞭さ

## 中核原則

What ではなく Why。コードが自分自身を説明し、コメントは意図を説明する。

| コメント種別 | 例                                                    | 判定 |
| ------------ | ----------------------------------------------------- | ---- |
| What         | `// Increment counter by 1`                           | 悪い |
| What         | `// Check if user is admin`                           | 悪い |
| Why          | `// Exponential backoff to avoid overwhelming server` | 良い |
| Why          | `// Legal: Data retained 7 years per compliance`      | 良い |

## コメントが必要な場面

| 文脈               | 例                                                |
| ------------------ | ------------------------------------------------- |
| 複雑なアルゴリズム | `// Boyer-Moore: O(n/m) vs naive O(n*m)`          |
| ビジネス ルール    | `// GDPR: EU users must explicitly opt-in`        |
| ワークアラウンド   | `// TODO(Q2 2025): Remove when API v2 deployed`   |
| パフォーマンス理由 | `// Cache to avoid expensive DB query per render` |

## アンチパターン

| パターン             | 問題                            | 解決策             |
| -------------------- | ------------------------------- | ------------------ |
| コメントアウトコード | 死んだコードが混乱を招く        | 削除。git が持つ   |
| 自明なコメント       | `// Set name to 'John'`         | 削除               |
| 履歴コメント         | `// 2024-01-05: Changed - John` | git history を使う |
| 古いコメント         | X と書きつつ実コードは Y        | 更新または削除     |

## 自己ドキュメント化されたコード

```typescript
// 悪い: コメントが必要
// Check if user can access premium features
if (u.sub && u.sub.exp > Date.now() && !u.ban) {
}

// 良い: 自己説明的
if (canAccessPremiumFeatures(user)) {
}
```

## 判断テスト

| 質問                                       | No なら            |
| ------------------------------------------ | ------------------ |
| これを削除してコードを自己説明的にできるか | コードをリファクタ |
| What でなく Why を説明しているか           | 削除または書き直し |
| このコメントは今も正確か                   | 更新または削除     |
