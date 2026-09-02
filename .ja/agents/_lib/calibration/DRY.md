# DRY (reviewer-duplication)

## REPORT

```typescript
// src/api/users.ts
async function getUser(id: string) {
  const db = await getConnection();
  const user = await db.query("SELECT * FROM users WHERE id = ?", [id]);
  if (!user) throw new NotFoundError("User not found");
  return user;
}

// src/api/teams.ts - same error handling pattern, same structure
async function getTeam(id: string) {
  const db = await getConnection();
  const team = await db.query("SELECT * FROM teams WHERE id = ?", [id]);
  if (!team) throw new NotFoundError("Team not found");
  return team;
}
// (also in orders.ts, projects.ts - 4 occurrences)
```

| Field   | Value                                                            |
| ------- | ---------------------------------------------------------------- |
| Filter  | Harm Test pass: 協調更新リスク                                   |
| Trigger | エラーハンドリング変更 (例: ロギング追加やカスタム error 型導入) |
| Impact  | 同一 4 箇所を更新必要; 1 つでも漏れると挙動が不一致になる        |
| Count   | 4 occurrences: Rule of Three の閾値超過                          |

## SKIP

```typescript
// src/api/users.ts
async function createUser(data: CreateUserInput) {
  validate(data);
  const user = await db.insert("users", { ...data, role: "member" });
  await sendWelcomeEmail(user.email);
  return user;
}

// src/api/teams.ts - similar structure, different business logic
async function createTeam(data: CreateTeamInput) {
  validate(data);
  const team = await db.insert("teams", { ...data, plan: "free" });
  await notifyAdmins(team.name);
  return team;
}
```

| Field  | Value                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| Filter | Context Test: 意味的差異                                                                                            |
| Signal | ドメイン固有のデフォルト (`role: "member"` vs `plan: "free"`) と side effect (`sendWelcomeEmail` vs `notifyAdmins`) |
| Count  | 2 occurrences: Rule of Three の抽出緊急性より下                                                                     |
