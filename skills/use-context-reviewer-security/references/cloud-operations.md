# Cloud Security: Pipeline and Operations

What ships the code, what fronts it, and what restores it.

## 1. Logging & Monitoring

| Issue                 | Fix                            |
| --------------------- | ------------------------------ |
| No audit logging      | Enable CloudTrail/CloudWatch   |
| Short retention       | 90+ days for compliance        |
| No alerts             | Alert on auth failures, errors |
| Sensitive data in log | Filter PII, passwords, tokens  |

```typescript
// Log security events (exclude sensitive data)
logger.warn("auth_failure", { userId: event.userId, ip: event.ip });
```

## 2. CI/CD Pipeline Security

| Issue                | Fix                            |
| -------------------- | ------------------------------ |
| Long-lived tokens    | Use OIDC for cloud auth        |
| No secrets scanning  | Add trufflehog/gitleaks        |
| No dependency audit  | `npm audit --audit-level=high` |
| Broad workflow perms | `permissions: contents: read`  |

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

## 3. CDN/WAF Security

| Issue              | Fix                          |
| ------------------ | ---------------------------- |
| No WAF             | Enable OWASP Core Ruleset    |
| No rate limiting   | Configure per-IP limits      |
| Missing headers    | Add security headers at edge |
| SSL/TLS permissive | Enforce TLS 1.2+ strict mode |

```typescript
// Edge security headers
headers.set("X-Frame-Options", "DENY");
headers.set("X-Content-Type-Options", "nosniff");
headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
```

## 4. Backup & DR

| Issue               | Fix                              |
| ------------------- | -------------------------------- |
| No automated backup | Daily backups, 30+ day retention |
| No point-in-time    | Enable PITR for databases        |
| Accidental deletion | Enable deletion protection       |
| Untested recovery   | Test quarterly                   |

```terraform
resource "aws_db_instance" "main" {
  backup_retention_period = 30
  deletion_protection     = true
  publicly_accessible     = false
}
```
