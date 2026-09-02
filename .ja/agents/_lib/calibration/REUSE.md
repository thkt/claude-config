# REUSE (reviewer-reuse)

## REPORT

```typescript
// src/features/billing/validate.ts - new code
function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// src/shared/validation.ts - already exists in codebase
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
```

| Field   | Value                                              |
| ------- | -------------------------------------------------- |
| Filter  | Harm Test pass: 同一ロジックの再実装               |
| Trigger | email 検証ルール変更 (例: + alias 許可)            |
| Impact  | 一方を更新してもう一方を忘れる; 検証が不整合になる |

## SKIP

```typescript
// src/features/billing/validate.ts - new code
function validateInvoiceDate(date: Date, billingCycle: BillingCycle): boolean {
  const cycleStart = billingCycle.startDate;
  const grace = billingCycle.gracePeriodDays;
  return date >= cycleStart && date <= addDays(cycleStart, grace);
}
```

| Field  | Value                                              |
| ------ | -------------------------------------------------- |
| Filter | Context Test: 既存等価物のないドメイン特化ロジック |
| Signal | billing cycle 検証はこの機能固有                   |
