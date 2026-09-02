# TEST (reviewer-testability)

## REPORT

```typescript
function sendReport() {
  const now = Date.now();
  const data = collectMetrics();
  fetch("/api/reports", { method: "POST", body: JSON.stringify({ ...data, ts: now }) });
  console.log(`Report sent at ${new Date(now).toISOString()}`);
}
```

| Field   | Value                                                              |
| ------- | ------------------------------------------------------------------ |
| Filter  | Harm Test pass - 3 hidden globals impossible to control in tests   |
| Trigger | Testing timestamp, HTTP call, and logging requires mocking globals |
| Impact  | Tests are flaky (time-dependent) or require complex setup          |

## SKIP

```typescript
function formatCurrency(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "JPY" }).format(amount);
}
```

| Field  | Value                                                        |
| ------ | ------------------------------------------------------------ |
| Filter | Context Test: pure function, no hidden dependencies          |
| Signal | `Intl.NumberFormat` is deterministic; test with input/output |
