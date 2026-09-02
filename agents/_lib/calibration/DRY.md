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

| Field   | Value                                                                |
| ------- | -------------------------------------------------------------------- |
| Filter  | Harm Test pass - coordinated update risk                             |
| Trigger | Error handling change (e.g., add logging or custom error type)       |
| Impact  | Must update 4 identical call sites; miss one = inconsistent behavior |
| Count   | 4 occurrences - above Rule of Three threshold                        |

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

| Field  | Value                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| Filter | Context Test: semantic difference                                                                                     |
| Signal | Domain-specific defaults (`role: "member"` vs `plan: "free"`) and side effects (`sendWelcomeEmail` vs `notifyAdmins`) |
| Count  | 2 occurrences - below Rule of Three extraction urgency                                                                |
