# TC (reviewer-coverage)

## REPORT

```rust
// src/auth.rs - public API, no test for invalid token path
pub fn verify_token(token: &str) -> Result<Claims, AuthError> {
    let decoded = decode(token, &KEY, &Validation::default())?;
    if decoded.claims.exp < now() {
        return Err(AuthError::Expired);
    }
    Ok(decoded.claims)
}
```

| Field       | Value                                                      |
| ----------- | ---------------------------------------------------------- |
| Filter      | Harm Test pass: 具体トリガー付きセキュリティリグレッション |
| Trigger     | expiry チェックがリグレッション                            |
| Impact      | 無効 token が静かに通る; auth bypass                       |
| Criticality | 9/10: public API, 認証境界                                 |

## SKIP

```rust
// src/internal/normalize.rs - private helper
fn normalize_whitespace(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

// tested indirectly via:
// tests/chunker_test.rs::test_chunk_normalizes_input
// tests/chunker_test.rs::test_chunk_preserves_newlines
```

| Field  | Value                                                                            |
| ------ | -------------------------------------------------------------------------------- |
| Filter | Context Test: indirect coverage                                                  |
| Signal | 2 つの chunker テストがこの helper を介して観測可能挙動を検査済み                |
| Note   | ここの単体テストは `split_whitespace` をテストするだけで、アプリロジックではない |
