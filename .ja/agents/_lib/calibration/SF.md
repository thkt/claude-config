# SF (reviewer-silence)

## REPORT (error returned as success)

```rust
fn sync_messages(&self, channel: &str) -> Result<usize> {
    match self.client.fetch_history(channel) {
        Ok(messages) => self.store(messages),
        Err(_) => Ok(0),  // caller sees "0 messages synced" - no error signal
    }
}
```

| Field   | Value                                                              |
| ------- | ------------------------------------------------------------------ |
| Filter  | Harm Test pass: 具体的失敗シナリオが存在                           |
| Trigger | Slack API でネットワークエラー、auth 失敗、rate limit              |
| Impact  | caller は `Ok(0)` を見て「0 件同期」と「API ダウン」を区別できない |

## SKIP (intentional default)

```rust
fn load_config(path: &Path) -> Config {
    match fs::read_to_string(path) {
        Ok(content) => toml::from_str(&content).unwrap_or_default(),
        Err(_) => Config::default(),  // first run - config file doesn't exist yet
    }
}
```

| Field  | Value                                                                |
| ------ | -------------------------------------------------------------------- |
| Filter | Context Test: 意図的 fallback                                        |
| Signal | 関数名 `load_config` (`require_config` ではない)、`default()` を返す |
| Path   | Cold: 起動時 1 回実行                                                |

## REPORT (catch as dispatch)

```javascript
const sibling = async (name, args) => {
  try {
    return await workflow(name, args);
  } catch {
    return await workflow(`build:${name}`, args); // fires on any error, not just an unresolved name
  }
};
```

| Field   | Value                                                          |
| ------- | -------------------------------------------------------------- |
| Filter  | Harm Test pass: 具体的失敗シナリオが存在                       |
| Trigger | 入れ子の workflow が名前解決以外の理由で throw する            |
| Impact  | 退避先の名前解決エラーが最終の失敗として残り、真の原因が消える |

## SKIP (single failure mode)

```javascript
function parseCache(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {}; // malformed cache is the only way to reach here
  }
}
```

| Field  | Value                                                                       |
| ------ | --------------------------------------------------------------------------- |
| Filter | Context Test: try 内の失敗経路が 1 本                                       |
| Signal | try 内の呼び出しは 1 つで throw も 1 通りなので、catch が別の原因を覆えない |
