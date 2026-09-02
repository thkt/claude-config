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
| Filter      | Harm Test pass - security regression with concrete trigger |
| Trigger     | Expiry check regresses                                     |
| Impact      | Invalid tokens pass silently; auth bypass                  |
| Criticality | 9/10 - public API, authentication boundary                 |

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

| Field  | Value                                                               |
| ------ | ------------------------------------------------------------------- |
| Filter | Context Test: indirect coverage                                     |
| Signal | Two chunker tests exercise observable behavior through this helper  |
| Note   | Unit test here would test `split_whitespace`, not application logic |
