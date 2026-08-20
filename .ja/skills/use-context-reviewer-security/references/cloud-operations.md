# クラウド セキュリティ: パイプラインと運用

何がコードを配送し、何が前段に立ち、何が復旧させるか。

## 1. ロギングとモニタリング

| 問題                        | 修正                                |
| --------------------------- | ----------------------------------- |
| 監査ロギングなし            | CloudTrail/CloudWatch を有効化      |
| 短い保持期間                | コンプライアンス用に 90+ 日         |
| アラートなし                | 認証失敗、エラーでアラート          |
| ログ内のセンシティブ データ | PII、パスワード、トークンをフィルタ |

```typescript
// セキュリティ イベントをログ (センシティブ データを除外)
logger.warn("auth_failure", { userId: event.userId, ip: event.ip });
```

## 2. CI/CD パイプライン セキュリティ

| 問題                      | 修正                           |
| ------------------------- | ------------------------------ |
| 長期トークン              | クラウド認証に OIDC を使う     |
| シークレット スキャンなし | trufflehog/gitleaks を追加     |
| 依存関係監査なし          | `npm audit --audit-level=high` |
| 広い workflow 権限        | `permissions: contents: read`  |

```yaml
jobs:
  deploy:
    permissions:
      contents: read
    steps:
      - uses: trufflesecurity/trufflehog@v3.92.5
      - run: npm audit --audit-level=high
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/deploy
```

## 3. CDN/WAF セキュリティ

| 問題             | 修正                               |
| ---------------- | ---------------------------------- |
| WAF なし         | OWASP Core Ruleset を有効化        |
| レート制限なし   | IP 単位の上限を設定                |
| ヘッダー欠落     | edge でセキュリティ ヘッダーを追加 |
| SSL/TLS 緩い設定 | TLS 1.2+ strict mode を強制        |

```typescript
// edge セキュリティ ヘッダー
headers.set("X-Frame-Options", "DENY");
headers.set("X-Content-Type-Options", "nosniff");
headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
```

## 4. バックアップと DR

| 問題                      | 修正                         |
| ------------------------- | ---------------------------- |
| 自動バックアップなし      | 日次バックアップ、30+ 日保持 |
| ポイント イン タイム なし | データベースで PITR を有効化 |
| 誤削除                    | 削除保護を有効化             |
| リカバリ未テスト          | 四半期ごとにテスト           |

```terraform
resource "aws_db_instance" "main" {
  backup_retention_period = 30
  deletion_protection     = true
  publicly_accessible     = false
}
```
