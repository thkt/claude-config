# OPS (reviewer-operations)

## REPORT

```tsx
function DashboardPage() {
  const { data } = useSWR("/api/dashboard", fetcher); // can throw
  return (
    <main>
      <h1>Dashboard</h1>
      <RevenueChart data={data.revenue} />
      <OrderTable data={data.orders} />
    </main>
  );
}
```

| Field   | Value                                                    |
| ------- | -------------------------------------------------------- |
| Filter  | Harm Test pass - page-level with no error containment    |
| Trigger | API returns error or unexpected shape                    |
| Impact  | Entire page white-screens; user sees React error overlay |

## SKIP

```tsx
function PriceTag({ amount }: { amount: number }) {
  return <span>{formatCurrency(amount)}</span>;
}
```

| Field  | Value                                                        |
| ------ | ------------------------------------------------------------ |
| Filter | Context Test: internal presentational, parent handles errors |
| Signal | No async, no side effects; parent ErrorBoundary covers this  |
