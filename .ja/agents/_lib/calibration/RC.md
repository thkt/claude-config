# RC (reviewer-causation)

## REPORT (retry が原因を隠す)

```typescript
// "Fix: add retry on save failure"
async function saveOrder(order: Order) {
  try {
    await db.save(order);
  } catch {
    await sleep(500);
    await db.save(order); // retry hides the real problem
  }
}
```

| Field   | Value                                                                  |
| ------- | ---------------------------------------------------------------------- |
| Filter  | Harm Test pass: 原因を理解しない retry                                 |
| Trigger | コネクションプール枯渇または制約違反                                   |
| Impact  | 失敗中 DB に二重負荷; 根本原因 (プールサイズや検証ギャップ) を覆い隠す |

## SKIP (意図的な transient retry)

```typescript
// Intentional retry for transient network errors
async function fetchExternalRate(currency: string): Promise<number> {
  return retry(() => fetch(`https://api.rates.com/${currency}`), {
    retries: 3,
    delay: 1000,
    retryOn: [503, 429], // only transient errors
  });
}
```

| Field  | Value                                                          |
| ------ | -------------------------------------------------------------- |
| Filter | Context Test: 既知の transient error に対する意図的 resilience |
| Signal | 特定 HTTP status code に限定; 外部依存                         |

## REPORT (justification camouflage)

```typescript
// PORT NOTE: upstream returns undefined on a cold cache instead of throwing,
// so we coerce to 0 here. Making the cache layer throw would ripple through
// 6 call sites, so we absorb it at the boundary for now. Safe because
// downstream treats 0 as "no data". TODO(port): revisit once the cache
// contract is unified.
function getBalance(userId: string): number {
  return cache.get(userId)?.balance ?? 0; // silently masks a cold-cache miss
}
```

| Field   | Value                                                                 |
| ------- | --------------------------------------------------------------------- |
| Filter  | Harm Test pass: 段落が cold-cache miss の 0 偽装を正当化              |
| Trigger | cold cache が undefined を返し、呼び出し元が miss でなく残高 0 を見る |
| Impact  | 誤った残高を実値として表示; コメントが contract 修正でなく近道を弁護  |

## SKIP (justification camouflage)

```typescript
// SAFETY: callers hold the table lock for this call (see LockGuard in tx.ts),
// so the raw slot cannot outlive the guard. Documented invariant of the
// storage layer, not a workaround.
function rowPtr(table: Table, idx: number): RowRef {
  return table.rawSlot(idx);
}
```

| Field  | Value                                                                  |
| ------ | ---------------------------------------------------------------------- |
| Filter | Context Test: コメントが実在し強制される invariant (ロック保持) を記録 |
| Signal | 呼び出し元が保証する事前条件であり、近道の言い訳ではない               |
