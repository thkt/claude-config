# DP (reviewer-design)

## REPORT (shallow, React)

```tsx
const ButtonWrapper = (props: ButtonProps) => <Button {...props} />;
```

| Field   | Value                                                                                 |
| ------- | ------------------------------------------------------------------------------------- |
| Filter  | Deletion test: removing collapses to `<Button>` at every call site with no logic loss |
| Trigger | Component forwards props 1:1 with no own state/effect/derivation                      |
| Impact  | Adds an indirection without hiding any behavior                                       |

## REPORT (shallow, Rust)

```rust
pub struct AppLogger;

impl AppLogger {
    pub fn info(&self, msg: &str) { event!(Level::INFO, "{}", msg); }
    pub fn warn(&self, msg: &str) { event!(Level::WARN, "{}", msg); }
    pub fn error(&self, msg: &str) { event!(Level::ERROR, "{}", msg); }
}
```

| Field   | Value                                                                              |
| ------- | ---------------------------------------------------------------------------------- |
| Filter  | Deletion test: callers invoke tracing macros directly; no abstraction is lost      |
| Trigger | Methods forward 1:1 to `tracing::event!` with no aggregation, validation, or state |
| Impact  | Renames a primitive without earning the wrapper                                    |

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

| Field  | Value                                                                                  |
| ------ | -------------------------------------------------------------------------------------- |
| Filter | Deletion test: removing forces every caller to re-implement fetch+state+rule+lifecycle |
| Signal | Aggregates 2 hooks, derives view-model, encodes a domain rule (shipped cannot cancel)  |

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
| Filter | Deletion test: removing forces callers to re-implement compile+validate+apply+reverse-lookup |
| Signal | Owns invariants (placeholder uniqueness), borrowed-vs-owned optimization, error taxonomy     |
