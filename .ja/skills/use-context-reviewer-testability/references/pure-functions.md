# 純粋関数

## 定義

| 性質                | 純粋 | 非純粋 |
| ------------------- | ---- | ------ |
| 同じ入力 → 同じ出力 | 可   | 不可   |
| 副作用なし          | 可   | 不可   |
| 外部状態なし        | 可   | 不可   |

## 例

| 非純粋                             | 純粋                                        |
| ---------------------------------- | ------------------------------------------- |
| グローバルな `taxRate` 使用        | `(price, taxRate) => price * (1 + taxRate)` |
| `cart.push(item)` ミューテーション | `[...cart, item]` 新しい配列                |
| 内部で `new Date()`                | `(expiry, now) => now > expiry`             |
| 内部で `api.getUser()`             | user をパラメータとして受け取る             |

## 分離パターン

```typescript
// Pure: ビジネスロジック
function calculateDiscount(purchases: number): number {
  if (purchases > 100) return 0.2;
  if (purchases > 50) return 0.15;
  return 0;
}

// Impure: データ取得 (隔離)
async function getUserDiscount(userId: string) {
  const history = await api.getPurchaseHistory(userId);
  return calculateDiscount(history.length);
}

// 純粋関数を簡単にテスト
expect(calculateDiscount(101)).toBe(0.2);
```

## React パターン

### コンポーネント分離

```typescript
// Pure: Presentational
function OrderSummary({ subtotal, tax, total }: Props) {
  return <div>Total: ${total}</div>
}

// Impure: Container
function OrderSummaryContainer() {
  const { items } = useCart() // 副作用
  const total = calculateTotal(items)
  return <OrderSummary total={total} />
}
```

### Hook 分離

```typescript
// Pure: 計算 hook
function useOrderCalc(items: Item[]) {
  return useMemo(() => {
    const subtotal = items.reduce((s, i) => s + i.price, 0);
    const tax = subtotal * 0.1;
    return { subtotal, tax };
  }, [items]);
}

// Impure: データ hook
function useOrderData(id: string) {
  const [items, setItems] = useState([]);
  useEffect(() => api.getItems(id).then(setItems), [id]);
  return items;
}
```

## テスト面のメリット

| 非純粋                 | 純粋                   |
| ---------------------- | ---------------------- |
| API mock が必要        | テストデータだけで済む |
| 外部状態のセットアップ | パラメータのみ         |
| 非同期/Flaky           | 同期的                 |
| 複雑なセットアップ     | 単純な呼び出し         |
