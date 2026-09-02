# SEC (reviewer-security)

## REPORT

```typescript
app.get("/users", async (req, res) => {
  const sort = req.query.sort;
  const users = await db.query(`SELECT * FROM users ORDER BY ${sort}`);
  res.json(users);
});
```

| Field   | Value                                             |
| ------- | ------------------------------------------------- |
| Filter  | Harm Test pass - exploitable SQL injection        |
| Trigger | `?sort=1; DROP TABLE users--`                     |
| Impact  | Arbitrary SQL execution; full database compromise |

## SKIP

```typescript
const ALLOWED_SORTS = ["name", "created_at", "email"] as const;

app.get("/users", async (req, res) => {
  const sort = ALLOWED_SORTS.includes(req.query.sort) ? req.query.sort : "name";
  const users = await db.query(`SELECT * FROM users ORDER BY ${sort}`);
  res.json(users);
});
```

| Field  | Value                                                            |
| ------ | ---------------------------------------------------------------- |
| Filter | Context Test: allowlist validation                               |
| Signal | `ALLOWED_SORTS.includes()` gates user input before interpolation |
