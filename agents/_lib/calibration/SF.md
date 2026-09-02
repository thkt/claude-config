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

| Field   | Value                                                                 |
| ------- | --------------------------------------------------------------------- |
| Filter  | Harm Test pass - concrete failure scenario exists                     |
| Trigger | Network error, auth failure, or rate limit on Slack API               |
| Impact  | Caller sees `Ok(0)`, cannot distinguish "no messages" from "API down" |

## SKIP (intentional default)

```rust
fn load_config(path: &Path) -> Config {
    match fs::read_to_string(path) {
        Ok(content) => toml::from_str(&content).unwrap_or_default(),
        Err(_) => Config::default(),  // first run - config file doesn't exist yet
    }
}
```

| Field  | Value                                                                  |
| ------ | ---------------------------------------------------------------------- |
| Filter | Context Test: intentional fallback                                     |
| Signal | Function name `load_config` (not `require_config`), `default()` return |
| Path   | Cold - runs once at startup                                            |

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

| Field   | Value                                                                                  |
| ------- | -------------------------------------------------------------------------------------- |
| Filter  | Harm Test pass - concrete failure scenario exists                                      |
| Trigger | The nested workflow throws for a reason other than an unresolved name                  |
| Impact  | The fallback's name-resolution error is the one that surfaces, hiding the real failure |

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

| Field  | Value                                                                            |
| ------ | -------------------------------------------------------------------------------- |
| Filter | Context Test: the try holds a single failure path                                |
| Signal | One call in the try, one way it throws, so the catch cannot cover a second cause |
