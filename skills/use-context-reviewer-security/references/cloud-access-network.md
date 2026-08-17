# Cloud Security: Access and Network

Who may reach the resource, and over what path.

## 1. IAM & Access Control

| Issue                   | Fix                                  |
| ----------------------- | ------------------------------------ |
| Root account in prod    | Use IAM roles, enable MFA            |
| `s3:*` on all resources | Specific actions on specific buckets |
| Long-lived credentials  | Use OIDC/assume role                 |
| No credential rotation  | Rotate every 90 days                 |

```yaml
# Good
iam_role:
  permissions: [s3:GetObject, s3:ListBucket]
  resources: [arn:aws:s3:::my-bucket/*]

# Bad
iam_role:
  permissions: ["s3:*"]
  resources: ["*"]
```

## 2. Secrets Management

| Issue                  | Fix                          |
| ---------------------- | ---------------------------- |
| Hardcoded secrets      | Use Secrets Manager / Vault  |
| `.env` in repo         | `.gitignore`, use CI secrets |
| No rotation            | Auto-rotate (30-90 days)     |
| Secrets in logs/errors | Exclude sensitive fields     |

```typescript
// Good
const client = new SecretsManager({ region: "us-east-1" });
const secret = await client.getSecretValue({ SecretId: "prod/api-key" });

// Bad: the key sits in the source as a string literal bound to a constant
```

## 3. Network Security

| Issue                | Fix                           |
| -------------------- | ----------------------------- |
| Public database      | `publicly_accessible = false` |
| SSH open to internet | Restrict to VPN/bastion CIDR  |
| All ports open       | Allow only required ports     |
| No VPC flow logs     | Enable for audit trail        |
| Unencrypted at rest  | Enable KMS encryption         |
| Permissive transit   | Enforce TLS 1.2+ end to end   |

```terraform
# Good
resource "aws_security_group" "app" {
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }
}

# Bad
resource "aws_security_group" "bad" {
  ingress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```
