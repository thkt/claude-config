# クラウド セキュリティ: アクセスとネットワーク

誰がリソースへ到達できるか、どの経路を通るか。

## 1. IAM とアクセス制御

| 問題                      | 修正                         |
| ------------------------- | ---------------------------- |
| 本番で root アカウント    | IAM ロール、MFA 有効化       |
| 全リソースに `s3:*`       | 特定バケットに特定アクション |
| 長期クレデンシャル        | OIDC / assume role を使う    |
| クレデンシャル ローテなし | 90 日ごとにローテーション    |

```yaml
# 良い
iam_role:
  permissions: [s3:GetObject, s3:ListBucket]
  resources: [arn:aws:s3:::my-bucket/*]

# 悪い
iam_role:
  permissions: ["s3:*"]
  resources: ["*"]
```

## 2. シークレット管理

| 問題                           | 修正                              |
| ------------------------------ | --------------------------------- |
| ハードコードされたシークレット | Secrets Manager / Vault を使う    |
| `.env` をリポジトリに含める    | `.gitignore`、CI シークレット使用 |
| ローテーションなし             | 自動ローテーション (30-90 日)     |
| ログ / エラー内のシークレット  | センシティブ フィールドを除外     |

```typescript
// 良い
const client = new SecretsManager({ region: "us-east-1" });
const secret = await client.getSecretValue({ SecretId: "prod/api-key" });

// 悪い: 鍵が文字列リテラルとして定数に束縛されソースへ残る
```

## 3. ネットワーク セキュリティ

| 問題                       | 修正                          |
| -------------------------- | ----------------------------- |
| パブリックなデータベース   | `publicly_accessible = false` |
| SSH がインターネットに開放 | VPN / 踏み台 CIDR に制限      |
| 全ポート開放               | 必要なポートのみ許可          |
| VPC フローログなし         | 監査トレイル用に有効化        |
| 保管時に暗号化なし         | KMS 暗号化を有効化            |
| 転送経路が緩い             | 端から端まで TLS 1.2+ を強制  |

```terraform
# 良い
resource "aws_security_group" "app" {
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }
}

# 悪い
resource "aws_security_group" "bad" {
  ingress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```
