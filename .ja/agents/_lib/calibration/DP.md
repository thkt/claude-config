# DP (reviewer-design)

## REPORT (shallow, React)

```tsx
const ButtonWrapper = (props: ButtonProps) => <Button {...props} />;
```

| Field   | Value                                                                         |
| ------- | ----------------------------------------------------------------------------- |
| Filter  | Deletion test: 削除すると全呼び出し箇所で `<Button>` に潰れ、ロジック損失なし |
| Trigger | component が自前の state/effect/導出なしに props を 1:1 転送                  |
| Impact  | 挙動を何も隠さずに間接層を 1 つ追加                                           |

## REPORT (shallow, Rust)

```rust
pub struct AppLogger;

impl AppLogger {
    pub fn info(&self, msg: &str) { event!(Level::INFO, "{}", msg); }
    pub fn warn(&self, msg: &str) { event!(Level::WARN, "{}", msg); }
    pub fn error(&self, msg: &str) { event!(Level::ERROR, "{}", msg); }
}
```

| Field   | Value                                                                     |
| ------- | ------------------------------------------------------------------------- |
| Filter  | Deletion test: caller が tracing マクロを直接呼べばよく、失われる抽象なし |
| Trigger | メソッドが集約・検証・state なしに `tracing::event!` へ 1:1 転送          |
| Impact  | wrapper に見合う働きをせず primitive を改名しただけ                       |

## SKIP (deep, React)

```tsx
function OrderContainer({ orderId }: { orderId: string }) {
  const { data, isLoading, error, refetch } = useOrder(orderId);
  const { mutate: cancel, isPending } = useCancelOrder();
  const handleCancel = useCallback(() => {
    if (data?.status === "shipped") return alert("Cannot cancel shipped order");
    cancel(orderId, { onSuccess: refetch });
  }, [orderId, cancel, refetch, data?.status]);
  if (isLoading) return <Spinner />;
  if (error) return <ErrorView err={error} />;
  return <OrderDetail order={data} isCancelling={isPending} onCancel={handleCancel} />;
}
```

| Field  | Value                                                                               |
| ------ | ----------------------------------------------------------------------------------- |
| Filter | Deletion test: 削除すると全 caller が fetch+state+rule+lifecycle を再実装させられる |
| Signal | 2 hook を集約し view-model を導出、ドメインルール (shipped はキャンセル不可) を内包 |

## SKIP (deep, Rust)

```rust
pub struct Redactor { /* compiled patterns + placeholder index */ }
impl Redactor {
    pub fn new(rules: &[RedactionRule]) -> Result<Self, RedactionError> { /* compile + validate uniqueness */ }
    pub fn redact<'a>(&self, text: &'a str) -> Cow<'a, str> { /* apply in order, Cow optimization */ }
    pub fn rule_for_placeholder(&self, p: &str) -> Option<&str> { /* reverse lookup */ }
}
```

| Field  | Value                                                                                        |
| ------ | -------------------------------------------------------------------------------------------- |
| Filter | Deletion test: 削除すると caller が compile+validate+apply+reverse-lookup を再実装させられる |
| Signal | invariant (placeholder の一意性)、borrowed-vs-owned 最適化、error taxonomy を所有            |
