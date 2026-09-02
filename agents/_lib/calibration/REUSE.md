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

| Field   | Value                                                 |
| ------- | ----------------------------------------------------- |
| Filter  | Harm Test pass - identical logic reimplemented        |
| Trigger | Email validation rule change (e.g., allow + aliases)  |
| Impact  | Update one, forget the other; inconsistent validation |

## SKIP

```typescript
// src/features/billing/validate.ts - new code
function validateInvoiceDate(date: Date, billingCycle: BillingCycle): boolean {
  const cycleStart = billingCycle.startDate;
  const grace = billingCycle.gracePeriodDays;
  return date >= cycleStart && date <= addDays(cycleStart, grace);
}
```

| Field  | Value                                                           |
| ------ | --------------------------------------------------------------- |
| Filter | Context Test: domain-specific logic with no existing equivalent |
| Signal | Billing cycle validation is unique to this feature              |
