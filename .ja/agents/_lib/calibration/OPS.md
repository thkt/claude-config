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

| Field   | Value                                                     |
| ------- | --------------------------------------------------------- |
| Filter  | Harm Test pass: page レベルでエラー封じ込めなし           |
| Trigger | API がエラーまたは予期しない shape を返す                 |
| Impact  | ページ全体が white-screen; ユーザーに React error overlay |

## SKIP

```tsx
function PriceTag({ amount }: { amount: number }) {
  return <span>{formatCurrency(amount)}</span>;
}
```

| Field  | Value                                             |
| ------ | ------------------------------------------------- |
| Filter | Context Test: 内部 presentational、親がエラー処理 |
| Signal | async なし、副作用なし; 親 ErrorBoundary がカバー |
