# CQ (reviewer-readability)

## REPORT

```typescript
function processOrder(order, user, config, db, logger) {
  if (order.items) {
    if (order.items.length > 0) {
      for (const item of order.items) {
        if (item.quantity > 0) {
          if (item.price !== undefined) {
            const t = item.price * item.quantity;
            // ...20 more lines
          }
        }
      }
    }
  }
}
```

| Field   | Value                                                     |
| ------- | --------------------------------------------------------- |
| Filter  | Senior Engineer Test pass - would request changes         |
| Trigger | Any reader encountering this function                     |
| Impact  | 5-level nesting + 6 args + single-letter var = unreadable |

## SKIP

```typescript
function createUser(name: string, email: string): User {
  const normalized = email.toLowerCase().trim();
  const user = { id: generateId(), name, email: normalized, createdAt: new Date() };
  return user;
}
```

| Field  | Value                                                              |
| ------ | ------------------------------------------------------------------ |
| Filter | Senior Engineer Test fail - preference, not defect                 |
| Signal | `normalized` and `user` aid readability; inlining saves no clarity |
