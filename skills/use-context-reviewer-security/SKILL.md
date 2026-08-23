---
name: use-context-reviewer-security
description: OWASP Top 10 security review. Do NOT use for readability (use-context-reviewer-readability) or test design (use-context-reviewer-testability).
when_to_use: security, OWASP, XSS, SQL injection, prompt injection, LLM security, セキュリティ, 脆弱性, cloud security, AWS, IAM, Terraform, クラウドセキュリティ, インフラ
allowed-tools: Read Agent Bash(ugrep:*) Bash(bfs:*)
agent: reviewer-security
context: fork
user-invocable: false
---

# use-context-reviewer-security

## Detection (OWASP Top 10)

LLM01 covers apps that pass untrusted content to an LLM. The sink is the prompt itself: untrusted text concatenated without a data/instruction boundary, or a caller-supplied value interpolated into a system prompt. Constrain an LLM tool such as `fetch_url` the same way as its non-LLM counterpart, A10 SSRF. The tool is the sink, not the prompt.

| ID    | Category                  | Pattern                                                                                                                                         | Fix                                                                                   |
| ----- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| LLM01 | Prompt Injection (LLM)    | Untrusted or caller-controlled value such as RAG docs, fetched content, tool results, or role args reaches the prompt with no data-only framing | Delimit untrusted content as data; map caller values to fixed enumerated instructions |
| A01   | Broken Access Control     | Missing auth, IDOR, path traversal                                                                                                              | Auth middleware, ownership check                                                      |
| A01   | CSRF                      | No CSRF token verification on state-changing requests (POST/PUT/PATCH/DELETE)                                                                   | Double Submit Cookie                                                                  |
| A01   | Open Redirect (Taint)     | URL param → `location.href` without validation                                                                                                  | Domain allowlist or relative-only                                                     |
| A02   | Cryptographic Failures    | `password: 'plaintext'`                                                                                                                         | bcrypt/argon2 hashing                                                                 |
| A02   | Timing Attack             | `===` comparison of tokens/signatures                                                                                                           | Constant-time comparison: XOR all bytes, decide last                                  |
| A02   | Sensitive Data Exposure   | JWT stored in localStorage/sessionStorage                                                                                                       | httpOnly cookie instead                                                               |
| A03   | Injection                 | `db.query(\`SELECT...${id}\`)`                                                                                                                  | Parameterized query, ORM                                                              |
| A03   | Injection                 | `exec(\`ping ${host}\`)`                                                                                                                        | Input validation, library instead                                                     |
| A03   | XSS                       | `dangerouslySetInnerHTML` (static presence)                                                                                                     | Default escaping, DOMPurify                                                           |
| A03   | XSS (Taint)               | `dangerouslySetInnerHTML={{ __html }}` without sanitizer                                                                                        | DOMPurify.sanitize() at boundary                                                      |
| A03   | XSS (Taint)               | Function arg → `innerHTML` without sanitization                                                                                                 | Sanitize at function boundary                                                         |
| A03   | XSS (Taint)               | `<a href={variable}>` with user-controlled URL                                                                                                  | Protocol allowlist of https/http only                                                 |
| A04   | Insecure Design           | `postMessage` handler without origin check                                                                                                      | Strict `event.origin` comparison                                                      |
| A05   | Security Misconfiguration | `cors({ origin: '*' })`                                                                                                                         | Explicit origin allowlist                                                             |
| A05   | Security Misconfiguration | `cookie: {}` with no options                                                                                                                    | secure, httpOnly, sameSite: 'strict'                                                  |
| A05   | Security Misconfiguration | `err.stack` in error response without `NODE_ENV` guard                                                                                          | Generic message in prod, log internally                                               |
| A07   | Authentication Failures   | No rate limit on auth endpoints (login, register, password-reset)                                                                               | Rate limiter middleware on auth route group                                           |
| A08   | Prototype Pollution       | Request object built with `...body` spread                                                                                                      | Explicit field assignment                                                             |
| A09   | Logging Failures          | `logger.info({ password })`                                                                                                                     | Exclude sensitive fields                                                              |
| A10   | SSRF                      | `fetch(userInputUrl)`                                                                                                                           | URL validation, allowlist                                                             |

## Reporting

Severity runs critical / high / medium, finding-schema.md's four levels minus `low`. A security finding carries no fix-it-if-you-notice level; reporting one asks for action. Report each independent vulnerability as its own finding. When one file holds two distinct issues (e.g. a path traversal and a separate prompt injection), list both as separate findings rather than folding one into a note on the other.

| Signal              | Severity | Required output                      |
| ------------------- | -------- | ------------------------------------ |
| Certain exploit     | critical | Full exploit scenario + concrete fix |
| Clear vulnerability | high     | Attack vector + concrete fix         |
| Possible issue      | medium   | verification_hint + suggested fix    |
| Speculative only    | none     | Do NOT report                        |

## References

| Topic            | Scope                             | File                                                   |
| ---------------- | --------------------------------- | ------------------------------------------------------ |
| Basic            | A01, A02, A07                     | ${CLAUDE_SKILL_DIR}/references/owasp-basic.md          |
| Injection        | A03                               | ${CLAUDE_SKILL_DIR}/references/owasp-injection.md      |
| Advanced         | A04-A06, A08-A10                  | ${CLAUDE_SKILL_DIR}/references/owasp-advanced.md       |
| Cloud access     | IAM, secrets, network             | ${CLAUDE_SKILL_DIR}/references/cloud-access-network.md |
| Cloud operations | Logging, CI/CD, CDN, backup       | ${CLAUDE_SKILL_DIR}/references/cloud-operations.md     |
| Taint (markup)   | HTML and attribute sinks          | ${CLAUDE_SKILL_DIR}/references/frontend-taint-html.md  |
| Taint (data)     | Cross-origin, navigation, storage | ${CLAUDE_SKILL_DIR}/references/frontend-taint-data.md  |

## Taint Review Workflow

Apply this to Taint (markup) and Taint (data) in the table above.

1. Identify taint sources such as user input, API responses, and URL parameters
2. Trace data flow to sinks such as DOM manipulation, navigation, and storage
3. Verify sanitization or validation exists at every source-to-sink path
4. Check that sanitization cannot be bypassed via error paths or conditional logic
