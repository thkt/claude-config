---
name: use-context-reviewer-security
description: OWASP Top 10 のセキュリティ レビュー。可読性は use-context-reviewer-readability、テスト設計は use-context-reviewer-testability に使う。
when_to_use: security, OWASP, XSS, SQL injection, prompt injection, LLM security, セキュリティ, 脆弱性, cloud security, AWS, IAM, Terraform, クラウドセキュリティ, インフラ
allowed-tools: Read Task Bash(ugrep:*) Bash(bfs:*)
agent: reviewer-security
context: fork
background: false
user-invocable: false
---

# セキュリティ レビュー

## 検出 (OWASP Top 10)

LLM01 は信頼できないコンテンツを LLM に渡すアプリを対象とする。sink はプロンプトそのものであり、データと指示の境界なく連結された信頼できないテキストや、システムプロンプトに補間された呼び出し側の値が該当する。`fetch_url` のような LLM ツールは、A10 SSRF など非 LLM の対応物と同じように制約する。sink はツールであってプロンプトではない。

| ID    | カテゴリ                  | パターン                                                                                                                                          | 修正                                                                                             |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A01   | Broken Access Control     | 認証なし、IDOR、path traversal                                                                                                                    | 認証ミドルウェア、所有権チェック                                                                 |
| A02   | Cryptographic Failures    | `password: 'plaintext'`                                                                                                                           | bcrypt/argon2 ハッシュ化                                                                         |
| A03   | Injection                 | `db.query(\`SELECT...${id}\`)`                                                                                                                    | パラメータ化クエリ、ORM                                                                          |
| A03   | Injection                 | `exec(\`ping ${host}\`)`                                                                                                                          | 入力バリデーション、ライブラリで代替                                                             |
| A03   | XSS                       | 静的に存在する `dangerouslySetInnerHTML`                                                                                                          | デフォルト エスケープ、DOMPurify                                                                 |
| A05   | Security Misconfiguration | `cors({ origin: '*' })`                                                                                                                           | 明示的な origin 許可リスト                                                                       |
| A05   | Security Misconfiguration | オプションなしの `cookie: {}`                                                                                                                     | secure, httpOnly, sameSite: 'strict'                                                             |
| A05   | Security Misconfiguration | エラー応答の `err.stack` で `NODE_ENV` ガードなし                                                                                                 | 本番では汎用メッセージ、内部だけにログ                                                           |
| A09   | Logging Failures          | `logger.info({ password })`                                                                                                                       | センシティブ フィールドを除外                                                                    |
| A10   | SSRF                      | `fetch(userInputUrl)`                                                                                                                             | URL バリデーション、許可リスト                                                                   |
| A07   | Authentication Failures   | 認証エンドポイント (login, register, password-reset) にレート制限なし                                                                             | auth ルートグループに rate limiter ミドルウェア                                                  |
| A01   | CSRF                      | 状態変更リクエスト (POST/PUT/PATCH/DELETE) に CSRF トークン検証なし                                                                               | Double Submit Cookie                                                                             |
| A02   | Timing Attack             | トークン/署名の `===` 比較                                                                                                                        | 定数時間比較。全バイトを XOR し最後に判定                                                        |
| A08   | Prototype Pollution       | `...body` スプレッドでリクエストオブジェクト構築                                                                                                  | 明示的なフィールド代入                                                                           |
| A03   | XSS (Taint)               | サニタイザなしの `dangerouslySetInnerHTML={{ __html }}`                                                                                           | 境界で DOMPurify.sanitize() を呼ぶ                                                               |
| A03   | XSS (Taint)               | 関数引数 → `innerHTML` でサニタイズなし                                                                                                           | 関数境界でサニタイズ                                                                             |
| A03   | XSS (Taint)               | ユーザー制御 URL を持つ `<a href={variable}>`                                                                                                     | https/http のみのプロトコル許可リスト                                                            |
| A01   | Open Redirect (Taint)     | URL パラメータ → `location.href` でバリデーションなし                                                                                             | ドメイン許可リストまたは相対のみ                                                                 |
| A04   | Insecure Design           | origin チェックなしの `postMessage` ハンドラ                                                                                                      | `event.origin` の厳密比較                                                                        |
| A02   | Sensitive Data Exposure   | localStorage/sessionStorage に保存された JWT                                                                                                      | httpOnly cookie に置き換える                                                                     |
| LLM01 | Prompt Injection (LLM)    | RAG ドキュメント・取得コンテンツ・ツール結果・role 引数など、信頼できない値や呼び出し側が制御する値が、データとしての枠付けなしにプロンプトへ到達 | 信頼できないコンテンツをデータとして区切る。呼び出し側の値は固定の列挙された指示にマッピングする |

## 報告

重大度スケールは critical / high / medium。常に `file:line` を含める。独立した脆弱性はそれぞれ個別の finding として報告する。1 つのファイルに別個の問題が 2 つある場合 (例: path traversal と別の prompt injection)、一方を他方の注記に畳み込まず、両方を別々の finding として列挙する。

| シグナル         | 重大度   | 必須出力                          |
| ---------------- | -------- | --------------------------------- |
| 確実な悪用       | critical | 完全な悪用シナリオ + 具体的な修正 |
| 明確な脆弱性     | high     | 攻撃ベクター + 具体的な修正       |
| 可能性のある問題 | medium   | verification_hint + 修正提案      |
| 投機的のみ       | none     | 報告しない                        |

## 参照ファイル

| トピック  | 範囲             | ファイル                                                   |
| --------- | ---------------- | ---------------------------------------------------------- |
| Basic     | A01, A02, A07    | ${CLAUDE_SKILL_DIR}/references/owasp-basic.md              |
| Injection | A03              | ${CLAUDE_SKILL_DIR}/references/owasp-injection.md          |
| Advanced  | A04-A06, A08-A10 | ${CLAUDE_SKILL_DIR}/references/owasp-advanced.md           |
| Cloud     | IAM, IaC, CI/CD  | ${CLAUDE_SKILL_DIR}/references/cloud-infrastructure.md     |
| Frontend  | Taint analysis   | ${CLAUDE_SKILL_DIR}/references/frontend-taint-checklist.md |
