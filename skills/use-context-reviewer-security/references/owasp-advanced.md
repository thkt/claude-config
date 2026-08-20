# OWASP Advanced Security

## 4. Insecure Design

| Issue         | Fix                           |
| ------------- | ----------------------------- |
| No rate limit | `express-rate-limit`          |
| Brute force   | Account lockout after N fails |
| No MFA        | Add for critical ops          |

```typescript
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
});
app.post("/api/login", loginLimiter, handler);
```

## 5. Security Misconfiguration

| Issue              | Fix                                                  |
| ------------------ | ---------------------------------------------------- |
| Debug in prod      | Check `NODE_ENV`                                     |
| CORS `*`           | Specific origins                                     |
| No headers         | Use `helmet()`                                       |
| Stack trace leaked | Omit `err.stack` from client responses in production |

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
// VULNERABLE: stack trace exposes internal paths
res.status(500).json({ error: err.message, stack: err.stack });

// SAFE: generic message in production, details in logs only
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
<!-- SRI for CDN -->
<script src="https://cdn/lib.js" integrity="sha384-..." crossorigin="anonymous"></script>
```

## 9. Logging Failures

| Log                 | Don't Log |
| ------------------- | --------- |
| Auth failures       | Passwords |
| Access denied       | Tokens    |
| Suspicious patterns | PII       |

```typescript
logger.warn("Login failed", {
  username: req.body.username,
  ip: req.ip,
  // NO password
});
```

## 10. SSRF

| Check    | Reject                                    |
| -------- | ----------------------------------------- |
| Protocol | Not http/https                            |
| Hostname | `localhost`, `127.*`, `192.168.*`, `10.*` |
| Domain   | Not in allowlist                          |

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
