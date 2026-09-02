# SEC (reviewer-security)

## REPORT

```typescript
app.get("/users", async (req, res) => {
  const sort = req.query.sort;
  const users = await db.query(`SELECT * FROM users ORDER BY ${sort}`);
  res.json(users);
});
```

| Field   | Value                                    |
| ------- | ---------------------------------------- |
| Filter  | Harm Test pass: 悪用可能な SQL injection |
| Trigger | `?sort=1; DROP TABLE users--`            |
| Impact  | 任意 SQL 実行; DB 全体侵害               |

## SKIP

```typescript
const ALLOWED_SORTS = ["name", "created_at", "email"] as const;

app.get("/users", async (req, res) => {
  const sort = ALLOWED_SORTS.includes(req.query.sort) ? req.query.sort : "name";
  const users = await db.query(`SELECT * FROM users ORDER BY ${sort}`);
  res.json(users);
});
```

| Field  | Value                                                             |
| ------ | ----------------------------------------------------------------- |
| Filter | Context Test: allowlist による検証                                |
| Signal | `ALLOWED_SORTS.includes()` が補間前にユーザー入力をゲートしている |
