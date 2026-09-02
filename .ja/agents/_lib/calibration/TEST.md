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
| Filter  | Harm Test pass: テストで制御できない隠れた global 3 つ             |
| Trigger | timestamp、HTTP 呼び出し、ロギングのテストは global の mock が必要 |
| Impact  | テストが flaky (時間依存) または複雑なセットアップが必要           |

## SKIP

```typescript
function formatCurrency(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "JPY" }).format(amount);
}
```

| Field  | Value                                                   |
| ------ | ------------------------------------------------------- |
| Filter | Context Test: 純粋関数、隠れた依存なし                  |
| Signal | `Intl.NumberFormat` は決定的; input/output でテスト可能 |
