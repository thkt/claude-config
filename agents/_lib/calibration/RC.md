# RC (reviewer-causation)

## REPORT (retry hides cause)

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

| Field   | Value                                                                        |
| ------- | ---------------------------------------------------------------------------- |
| Filter  | Harm Test pass - retry without understanding cause                           |
| Trigger | Connection pool exhaustion or constraint violation                           |
| Impact  | Doubles load on failing DB; masks root cause (pool sizing or validation gap) |

## SKIP (intentional transient retry)

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

| Field  | Value                                                           |
| ------ | --------------------------------------------------------------- |
| Filter | Context Test: intentional resilience for known transient errors |
| Signal | Scoped to specific HTTP status codes; external dependency       |

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

| Field   | Value                                                                                |
| ------- | ------------------------------------------------------------------------------------ |
| Filter  | Harm Test pass - a paragraph rationalizes masking a cold-cache miss as a real 0      |
| Trigger | Cold cache returns undefined; caller sees balance 0 instead of a miss                |
| Impact  | Wrong balance shown as real; comment defends the shortcut instead of fixing contract |

## SKIP (justification camouflage)

```typescript
// SAFETY: callers hold the table lock for this call (see LockGuard in tx.ts),
// so the raw slot cannot outlive the guard. Documented invariant of the
// storage layer, not a workaround.
function rowPtr(table: Table, idx: number): RowRef {
  return table.rawSlot(idx);
}
```

| Field  | Value                                                                     |
| ------ | ------------------------------------------------------------------------- |
| Filter | Context Test: comment documents a real, enforced invariant (lock held)    |
| Signal | States a precondition the caller guarantees, not an excuse for a shortcut |
