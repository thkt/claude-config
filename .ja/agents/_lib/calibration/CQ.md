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

| Field   | Value                                      |
| ------- | ------------------------------------------ |
| Filter  | Senior Engineer Test pass: 変更を要請する  |
| Trigger | この関数に出会った任意の読み手             |
| Impact  | 5 段ネスト + 6 引数 + 1 文字変数で読めない |

## SKIP

```typescript
function createUser(name: string, email: string): User {
  const normalized = email.toLowerCase().trim();
  const user = { id: generateId(), name, email: normalized, createdAt: new Date() };
  return user;
}
```

| Field  | Value                                                                  |
| ------ | ---------------------------------------------------------------------- |
| Filter | Senior Engineer Test fail: 好みの問題、欠陥ではない                    |
| Signal | `normalized` と `user` は可読性に寄与; inline しても明瞭性は変わらない |
