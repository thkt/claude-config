# Comments & Code Clarity

## Core Principle

Why, not What. Code should explain itself; comments explain intent.

| Comment Type | Example                                               | Verdict |
| ------------ | ----------------------------------------------------- | ------- |
| What         | `// Increment counter by 1`                           | Bad     |
| What         | `// Check if user is admin`                           | Bad     |
| Why          | `// Exponential backoff to avoid overwhelming server` | Good    |
| Why          | `// Legal: Data retained 7 years per compliance`      | Good    |

## When Comments ARE Needed

| Context             | Example                                           |
| ------------------- | ------------------------------------------------- |
| Complex algorithms  | `// Boyer-Moore: O(n/m) vs naive O(n*m)`          |
| Business rules      | `// GDPR: EU users must explicitly opt-in`        |
| Workarounds         | `// TODO(Q2 2025): Remove when API v2 deployed`   |
| Performance reasons | `// Cache to avoid expensive DB query per render` |

## Anti-Patterns

| Pattern           | Problem                         | Solution             |
| ----------------- | ------------------------------- | -------------------- |
| Commented code    | Dead code confusion             | Delete; git keeps it |
| Obvious comments  | `// Set name to 'John'`         | Remove               |
| Journal comments  | `// 2024-01-05: Changed - John` | Use git history      |
| Outdated comments | Says X, code does Y             | Update or delete     |

## Self-Documenting Code

```typescript
// Bad: Needs comment
// Check if user can access premium features
if (u.sub && u.sub.exp > Date.now() && !u.ban) {
}

// Good: Self-explanatory
if (canAccessPremiumFeatures(user)) {
}
```

## Decision Test

| Question                                       | If No             |
| ---------------------------------------------- | ----------------- |
| Can I delete this and make code self-document? | Refactor code     |
| Does this explain WHY, not WHAT?               | Remove or rewrite |
| Is this comment still accurate?                | Update or delete  |
