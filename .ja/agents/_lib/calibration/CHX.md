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

| Field        | Value                                                           |
| ------------ | --------------------------------------------------------------- |
| Filter       | Harm Test pass: timeout/retry/circuit breaker なしの外部 API    |
| Trigger      | Slack API レイテンシ > 30s、network partition、rate limit (429) |
| Failure      | caller が無期限ハング; sync pipeline 全体がブロック             |
| Blast radius | high (`fetch_messages` の全 caller がブロック)                  |
| Hypothesis   | 明示 timeout なしで TCP socket は OS デフォルト (~2min) を待つ  |

## SKIP

```rust
fn clamp(value: i32, min: i32, max: i32) -> i32 {
    value.max(min).min(max)
}
```

| Field  | Value                                           |
| ------ | ----------------------------------------------- |
| Filter | Context Test: 純粋関数、failure mode なし       |
| Signal | 決定的、I/O なし、共有状態なし、retry path 不要 |
