# OWASP 上級セキュリティ

## 4. Insecure Design

| 問題              | 修正                        |
| ----------------- | --------------------------- |
| レート制限なし    | `express-rate-limit`        |
| ブルート フォース | N 回失敗でアカウント ロック |
| MFA なし          | 重要な操作に追加            |

```typescript
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
});
app.post("/api/login", loginLimiter, handler);
```

## 5. Security Misconfiguration

| 問題                    | 修正                                          |
| ----------------------- | --------------------------------------------- |
| 本番でデバッグ          | `NODE_ENV` をチェック                         |
| CORS `*`                | 特定 origin を指定                            |
| ヘッダーなし            | `helmet()` を使う                             |
| スタック トレース漏えい | 本番のクライアント応答から `err.stack` を除外 |

```typescript
app.use(helmet());
app.use(
  cors({
    origin: ["https://example.com"],
    credentials: true,
  }),
);
```

```typescript
// 脆弱: スタック トレースが内部パスを露出
res.status(500).json({ error: err.message, stack: err.stack });

// 安全: 本番では汎用メッセージ、詳細はログのみ
const isProd = process.env.NODE_ENV === "production";
res.status(500).json({ error: isProd ? "Internal server error" : err.message });
logger.error({ err }, "Unhandled error");
```

## 6. Vulnerable Components

```bash
npm audit
npm audit fix
npx snyk test
```

## 8. Software Integrity

```html
<!-- CDN 用 SRI -->
<script src="https://cdn/lib.js" integrity="sha384-..." crossorigin="anonymous"></script>
```

## 9. Logging Failures

| ログに残す     | ログに残さない |
| -------------- | -------------- |
| 認証失敗       | パスワード     |
| アクセス拒否   | トークン       |
| 不審なパターン | PII            |

```typescript
logger.warn("Login failed", {
  username: req.body.username,
  ip: req.ip,
  // パスワードは除外
});
```

## 10. SSRF

| チェック   | 拒否対象                                  |
| ---------- | ----------------------------------------- |
| プロトコル | http/https 以外                           |
| ホスト名   | `localhost`, `127.*`, `192.168.*`, `10.*` |
| ドメイン   | 許可リストにない                          |

```typescript
function isAllowedUrl(input: string, allowlist: string[]): boolean {
  try {
    const url = new URL(input);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (/^(localhost|127\.|192\.168\.|10\.)/.test(url.hostname)) return false;
    return allowlist.some((d) => url.hostname.endsWith(d));
  } catch {
    return false;
  }
}
```
