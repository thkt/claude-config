# EFF (reviewer-efficiency)

## REPORT

```rust
fn search(&self, query: &str) -> Vec<Result> {
    let db = Connection::open(&self.db_path).unwrap();  // opens on every call
    let embedding = self.embed(query);
    db.query("SELECT * FROM chunks ORDER BY distance(?, embedding)", [embedding])
}
```

| Field   | Value                                                             |
| ------- | ----------------------------------------------------------------- |
| Filter  | Harm Test pass: ホットパスでの計測可能な無駄                      |
| Trigger | ユーザー検索のたび                                                |
| Impact  | プール再利用ではなく呼び出しごとに新規 DB 接続; レイテンシ + leak |
| Path    | Hot: ユーザー向け関数                                             |

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

| Field  | Value                                                          |
| ------ | -------------------------------------------------------------- |
| Filter | Context Test: cold path                                        |
| Signal | 起動時 1 回実行、env var 2 回読みは無視できる                  |
| Path   | Cold: ユーザー目に見える効果ゼロでキャッシュは複雑度を増すだけ |
