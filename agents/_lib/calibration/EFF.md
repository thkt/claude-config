# EFF (reviewer-efficiency)

## REPORT

```rust
fn search(&self, query: &str) -> Vec<Result> {
    let db = Connection::open(&self.db_path).unwrap();  // opens on every call
    let embedding = self.embed(query);
    db.query("SELECT * FROM chunks ORDER BY distance(?, embedding)", [embedding])
}
```

| Field   | Value                                                            |
| ------- | ---------------------------------------------------------------- |
| Filter  | Harm Test pass - measurable waste on hot path                    |
| Trigger | Every user search call                                           |
| Impact  | New DB connection per call instead of pool reuse; latency + leak |
| Path    | Hot - user-facing function                                       |

## SKIP

```rust
fn init_config() -> Config {
    let home = std::env::var("HOME").unwrap_or_default();
    let xdg = std::env::var("XDG_CONFIG_HOME").unwrap_or_default();
    let path = if xdg.is_empty() {
        PathBuf::from(&home).join(".config/app")
    } else {
        PathBuf::from(&xdg).join("app")
    };
    Config::load(path)
}
```

| Field  | Value                                                        |
| ------ | ------------------------------------------------------------ |
| Filter | Context Test: cold path                                      |
| Signal | Runs once at startup; two env var reads are negligible       |
| Path   | Cold - caching adds complexity for zero user-visible benefit |
