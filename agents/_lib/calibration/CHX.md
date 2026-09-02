# CHX (reviewer-resilience)

## REPORT

```rust
// src/sync/slack.rs - external API call without resilience controls
async fn fetch_messages(&self, channel: &str) -> Result<Vec<Message>> {
    let response = self.client
        .get(&format!("{}/conversations.history", self.base))
        .send()
        .await?;
    Ok(response.json().await?)
}
```

| Field        | Value                                                                   |
| ------------ | ----------------------------------------------------------------------- |
| Filter       | Harm Test pass - external API without timeout/retry/circuit breaker     |
| Trigger      | Slack API latency > 30s, network partition, or rate limit (429)         |
| Failure      | Caller hangs indefinitely; entire sync pipeline blocks                  |
| Blast radius | high (every caller of `fetch_messages` blocks)                          |
| Hypothesis   | Without explicit timeout, TCP socket waits for OS-level default (~2min) |

## SKIP

```rust
fn clamp(value: i32, min: i32, max: i32) -> i32 {
    value.max(min).min(max)
}
```

| Field  | Value                                                        |
| ------ | ------------------------------------------------------------ |
| Filter | Context Test: pure function, no failure modes                |
| Signal | Deterministic, no I/O, no shared state, no retry path needed |
