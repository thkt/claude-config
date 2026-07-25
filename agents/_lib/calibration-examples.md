# Calibration Examples

Domain-specific REPORT/SKIP examples for audit reviewers. Each reviewer references this file. Principles are in `~/.claude/agents/_lib/finding-schema.md`.

## CQ (reviewer-readability)

### REPORT

```typescript
function processOrder(order, user, config, db, logger) {
  if (order.items) {
    if (order.items.length > 0) {
      for (const item of order.items) {
        if (item.quantity > 0) {
          if (item.price !== undefined) {
            const t = item.price * item.quantity;
            // ...20 more lines
          }
        }
      }
    }
  }
}
```

| Field   | Value                                                     |
| ------- | --------------------------------------------------------- |
| Filter  | Senior Engineer Test pass - would request changes         |
| Trigger | Any reader encountering this function                     |
| Impact  | 5-level nesting + 6 args + single-letter var = unreadable |

### SKIP

```typescript
function createUser(name: string, email: string): User {
  const normalized = email.toLowerCase().trim();
  const user = { id: generateId(), name, email: normalized, createdAt: new Date() };
  return user;
}
```

| Field  | Value                                                              |
| ------ | ------------------------------------------------------------------ |
| Filter | Senior Engineer Test fail - preference, not defect                 |
| Signal | `normalized` and `user` aid readability; inlining saves no clarity |

## EFF (reviewer-efficiency)

### REPORT

```rust
fn search(&self, query: &str) -> Vec<Result> {
    let db = Connection::open(&self.db_path).unwrap();  // opens on every call
    let embedding = self.embed(query);
    db.query("SELECT * FROM chunks ORDER BY distance(?, embedding)", [embedding])
}
```

| Field   | Value                                                            |
| ------- | ---------------------------------------------------------------- |
| Filter  | Harm Test pass - measurable waste on hot path                    |
| Trigger | Every user search call                                           |
| Impact  | New DB connection per call instead of pool reuse; latency + leak |
| Path    | Hot - user-facing function                                       |

### SKIP

```rust
fn init_config() -> Config {
    let home = std::env::var("HOME").unwrap_or_default();
    let xdg = std::env::var("XDG_CONFIG_HOME").unwrap_or_default();
    let path = if xdg.is_empty() {
        PathBuf::from(&home).join(".config/app")
    } else {
        PathBuf::from(&xdg).join("app")
    };
    Config::load(path)
}
```

| Field  | Value                                                        |
| ------ | ------------------------------------------------------------ |
| Filter | Context Test: cold path                                      |
| Signal | Runs once at startup; two env var reads are negligible       |
| Path   | Cold - caching adds complexity for zero user-visible benefit |

## TC (reviewer-coverage)

### REPORT

```rust
// src/auth.rs - public API, no test for invalid token path
pub fn verify_token(token: &str) -> Result<Claims, AuthError> {
    let decoded = decode(token, &KEY, &Validation::default())?;
    if decoded.claims.exp < now() {
        return Err(AuthError::Expired);
    }
    Ok(decoded.claims)
}
```

| Field       | Value                                                      |
| ----------- | ---------------------------------------------------------- |
| Filter      | Harm Test pass - security regression with concrete trigger |
| Trigger     | Expiry check regresses                                     |
| Impact      | Invalid tokens pass silently; auth bypass                  |
| Criticality | 9/10 - public API, authentication boundary                 |

### SKIP

```rust
// src/internal/normalize.rs - private helper
fn normalize_whitespace(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

// tested indirectly via:
// tests/chunker_test.rs::test_chunk_normalizes_input
// tests/chunker_test.rs::test_chunk_preserves_newlines
```

| Field  | Value                                                               |
| ------ | ------------------------------------------------------------------- |
| Filter | Context Test: indirect coverage                                     |
| Signal | Two chunker tests exercise observable behavior through this helper  |
| Note   | Unit test here would test `split_whitespace`, not application logic |

## DRY (reviewer-duplication)

### REPORT

```typescript
// src/api/users.ts
async function getUser(id: string) {
  const db = await getConnection();
  const user = await db.query("SELECT * FROM users WHERE id = ?", [id]);
  if (!user) throw new NotFoundError("User not found");
  return user;
}

// src/api/teams.ts - same error handling pattern, same structure
async function getTeam(id: string) {
  const db = await getConnection();
  const team = await db.query("SELECT * FROM teams WHERE id = ?", [id]);
  if (!team) throw new NotFoundError("Team not found");
  return team;
}
// (also in orders.ts, projects.ts - 4 occurrences)
```

| Field   | Value                                                                |
| ------- | -------------------------------------------------------------------- |
| Filter  | Harm Test pass - coordinated update risk                             |
| Trigger | Error handling change (e.g., add logging or custom error type)       |
| Impact  | Must update 4 identical call sites; miss one = inconsistent behavior |
| Count   | 4 occurrences - above Rule of Three threshold                        |

### SKIP

```typescript
// src/api/users.ts
async function createUser(data: CreateUserInput) {
  validate(data);
  const user = await db.insert("users", { ...data, role: "member" });
  await sendWelcomeEmail(user.email);
  return user;
}

// src/api/teams.ts - similar structure, different business logic
async function createTeam(data: CreateTeamInput) {
  validate(data);
  const team = await db.insert("teams", { ...data, plan: "free" });
  await notifyAdmins(team.name);
  return team;
}
```

| Field  | Value                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| Filter | Context Test: semantic difference                                                                                     |
| Signal | Domain-specific defaults (`role: "member"` vs `plan: "free"`) and side effects (`sendWelcomeEmail` vs `notifyAdmins`) |
| Count  | 2 occurrences - below Rule of Three extraction urgency                                                                |

## SF (reviewer-silence)

### REPORT

```rust
fn sync_messages(&self, channel: &str) -> Result<usize> {
    match self.client.fetch_history(channel) {
        Ok(messages) => self.store(messages),
        Err(_) => Ok(0),  // caller sees "0 messages synced" - no error signal
    }
}
```

| Field   | Value                                                                 |
| ------- | --------------------------------------------------------------------- |
| Filter  | Harm Test pass - concrete failure scenario exists                     |
| Trigger | Network error, auth failure, or rate limit on Slack API               |
| Impact  | Caller sees `Ok(0)`, cannot distinguish "no messages" from "API down" |

### SKIP

```rust
fn load_config(path: &Path) -> Config {
    match fs::read_to_string(path) {
        Ok(content) => toml::from_str(&content).unwrap_or_default(),
        Err(_) => Config::default(),  // first run - config file doesn't exist yet
    }
}
```

| Field  | Value                                                                  |
| ------ | ---------------------------------------------------------------------- |
| Filter | Context Test: intentional fallback                                     |
| Signal | Function name `load_config` (not `require_config`), `default()` return |
| Path   | Cold - runs once at startup                                            |

## SEC (reviewer-security)

### REPORT

```typescript
app.get("/users", async (req, res) => {
  const sort = req.query.sort;
  const users = await db.query(`SELECT * FROM users ORDER BY ${sort}`);
  res.json(users);
});
```

| Field   | Value                                             |
| ------- | ------------------------------------------------- |
| Filter  | Harm Test pass - exploitable SQL injection        |
| Trigger | `?sort=1; DROP TABLE users--`                     |
| Impact  | Arbitrary SQL execution; full database compromise |

### SKIP

```typescript
const ALLOWED_SORTS = ["name", "created_at", "email"] as const;

app.get("/users", async (req, res) => {
  const sort = ALLOWED_SORTS.includes(req.query.sort) ? req.query.sort : "name";
  const users = await db.query(`SELECT * FROM users ORDER BY ${sort}`);
  res.json(users);
});
```

| Field  | Value                                                            |
| ------ | ---------------------------------------------------------------- |
| Filter | Context Test: allowlist validation                               |
| Signal | `ALLOWED_SORTS.includes()` gates user input before interpolation |

## RP (reviewer-react-pattern)

### REPORT

```tsx
function OrderPage() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("date");

  useEffect(() => { fetch("/api/orders").then(r => r.json()).then(setOrders); }, []);

  const filtered = orders.filter(o => o.name.includes(filter));
  const sorted = filtered.sort((a, b) => a[sort] > b[sort] ? 1 : -1);

  return (
    <div>
      <input value={filter} onChange={e => setFilter(e.target.value)} />
      <select value={sort} onChange={e => setSort(e.target.value)}>
        <option value="date">Date</option>
        <option value="name">Name</option>
      </select>
      {sorted.map(o => (
        <div key={o.id}>
          <h3>{o.name}</h3>
          <p>{o.total}</p>
          {/* ...30 more lines of rendering */}
        </div>
      ))}
    </div>
  );
}
```

| Field   | Value                                                         |
| ------- | ------------------------------------------------------------- |
| Filter  | Harm Test pass - fetch + filter + sort + render all in one    |
| Trigger | Adding a new filter type requires editing rendering code      |
| Impact  | Untestable logic; render-coupled state; growing without bound |

### SKIP

```tsx
function UserAvatar({ name, src }: { name: string; src: string }) {
  const initials = name.split(" ").map(n => n[0]).join("");
  return <img src={src} alt={initials} onError={e => (e.target.textContent = initials)} />;
}
```

| Field  | Value                                                           |
| ------ | --------------------------------------------------------------- |
| Filter | Context Test: single responsibility, leaf component             |
| Signal | Deriving `initials` is trivial; extracting a hook adds overhead |

## DP (reviewer-design)

### REPORT (shallow, React)

```tsx
const ButtonWrapper = (props: ButtonProps) => <Button {...props} />;
```

| Field   | Value                                                                                |
| ------- | ------------------------------------------------------------------------------------ |
| Filter  | Deletion test: removing collapses to `<Button>` at every call site with no logic loss |
| Trigger | Component forwards props 1:1 with no own state/effect/derivation                     |
| Impact  | Adds an indirection without hiding any behavior                                      |

### REPORT (shallow, Rust)

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
| Filter  | Deletion test: callers invoke tracing macros directly; no abstraction is lost     |
| Trigger | Methods forward 1:1 to `tracing::event!` with no aggregation, validation, or state |
| Impact  | Renames a primitive without earning the wrapper                                    |

### SKIP (deep, React)

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

### SKIP (deep, Rust)

```rust
pub struct Redactor { /* compiled patterns + placeholder index */ }
impl Redactor {
    pub fn new(rules: &[RedactionRule]) -> Result<Self, RedactionError> { /* compile + validate uniqueness */ }
    pub fn redact<'a>(&self, text: &'a str) -> Cow<'a, str> { /* apply in order, Cow optimization */ }
    pub fn rule_for_placeholder(&self, p: &str) -> Option<&str> { /* reverse lookup */ }
}
```

| Field  | Value                                                                                       |
| ------ | ------------------------------------------------------------------------------------------- |
| Filter | Deletion test: removing forces callers to re-implement compile+validate+apply+reverse-lookup |
| Signal | Owns invariants (placeholder uniqueness), borrowed-vs-owned optimization, error taxonomy    |

## TEST (reviewer-testability)

### REPORT

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

### SKIP

```typescript
function formatCurrency(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "JPY" }).format(amount);
}
```

| Field  | Value                                                        |
| ------ | ------------------------------------------------------------ |
| Filter | Context Test: pure function, no hidden dependencies          |
| Signal | `Intl.NumberFormat` is deterministic; test with input/output |

## PE (reviewer-progressive)

### REPORT

```javascript
window.addEventListener("resize", () => {
  if (window.innerWidth < 768) {
    sidebar.style.display = "none";
  } else {
    sidebar.style.display = "block";
  }
});
```

| Field   | Value                                                                                    |
| ------- | ---------------------------------------------------------------------------------------- |
| Filter  | Harm Test pass - CSS media query replaces this entirely                                  |
| Trigger | Every window resize fires JS handler                                                     |
| Impact  | `@media (max-width: 768px) { .sidebar { display: none } }` - zero JS, better performance |

### SKIP

```javascript
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      loadMoreItems();
      observer.unobserve(entry.target);
    }
  });
});
observer.observe(sentinelRef.current);
```

| Field  | Value                                                         |
| ------ | ------------------------------------------------------------- |
| Filter | Context Test: no CSS equivalent for data fetching on scroll   |
| Signal | IntersectionObserver triggers API call; CSS cannot fetch data |

## OPS (reviewer-operations)

### REPORT

```tsx
function DashboardPage() {
  const { data } = useSWR("/api/dashboard", fetcher);  // can throw
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

### SKIP

```tsx
function PriceTag({ amount }: { amount: number }) {
  return <span>{formatCurrency(amount)}</span>;
}
```

| Field  | Value                                                        |
| ------ | ------------------------------------------------------------ |
| Filter | Context Test: internal presentational, parent handles errors |
| Signal | No async, no side effects; parent ErrorBoundary covers this  |

## RC (reviewer-causation)

### REPORT (retry hides cause)

```typescript
// "Fix: add retry on save failure"
async function saveOrder(order: Order) {
  try {
    await db.save(order);
  } catch {
    await sleep(500);
    await db.save(order);  // retry hides the real problem
  }
}
```

| Field   | Value                                                                        |
| ------- | ---------------------------------------------------------------------------- |
| Filter  | Harm Test pass - retry without understanding cause                           |
| Trigger | Connection pool exhaustion or constraint violation                           |
| Impact  | Doubles load on failing DB; masks root cause (pool sizing or validation gap) |

### SKIP (intentional transient retry)

```typescript
// Intentional retry for transient network errors
async function fetchExternalRate(currency: string): Promise<number> {
  return retry(() => fetch(`https://api.rates.com/${currency}`), {
    retries: 3,
    delay: 1000,
    retryOn: [503, 429],  // only transient errors
  });
}
```

| Field  | Value                                                           |
| ------ | --------------------------------------------------------------- |
| Filter | Context Test: intentional resilience for known transient errors |
| Signal | Scoped to specific HTTP status codes; external dependency       |

### REPORT (justification camouflage)

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

### SKIP (justification camouflage)

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

## REUSE (reviewer-reuse)

### REPORT

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

### SKIP

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

## Installation

Install globally: $ npm install -g myapp
```

| Field   | Value                                                            |
| ------- | ---------------------------------------------------------------- |
| Filter  | Harm Test pass - outdated instruction causes user failure        |
| Trigger | User follows deprecated global install; conflicts with npx usage |
| Impact  | Setup failure on first experience; user abandons                 |

### SKIP

```markdown
## Architecture

The system uses a pipeline pattern where each stage transforms the input and passes it to the next stage.
```

| Field  | Value                                                          |
| ------ | -------------------------------------------------------------- |
| Filter | Context Test: accurate prose, style preference not defect      |
| Signal | Content is correct; adding a diagram is improvement, not a fix |

## PQ (reviewer-prompt)

### REPORT

```markdown
When you encounter a situation where the user has provided input that needs to be validated, you should first check whether the input conforms to the expected format.
If it does not conform, you should return an appropriate error message.
If it does conform, you should proceed with processing the input according to the rules defined below.
```

| Field   | Value                                           |
| ------- | ----------------------------------------------- |
| Filter  | Harm Test pass - 4 lines of prose = 1 table row |
| Trigger | LLM processes ~60 tokens for a 2-column rule    |
| Impact  | Equivalent 2-column table row saves 50+ tokens  |

### SKIP

```markdown
This reviewer detects silent failures - errors that are caught but not surfaced to the user or logged for operators.
```

| Field  | Value                                                         |
| ------ | ------------------------------------------------------------- |
| Filter | Context Test: 2-line intro before detailed table              |
| Signal | Brief context-setting prose; converting to table adds nothing |

## A11Y (reviewer-accessibility)

### REPORT

```tsx
function Dropdown({ items, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div onClick={() => setOpen(!open)}>Select...</div>
      {open && (
        <ul>
          {items.map(item => (
            <li key={item.id} onClick={() => onSelect(item)}>{item.label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

| Field   | Value                                                                 |
| ------- | --------------------------------------------------------------------- |
| Filter  | Harm Test pass - keyboard and screen reader inaccessible              |
| Trigger | Tab key skips dropdown; screen reader announces "group" not "listbox" |
| Impact  | WCAG 2.1.1 (Keyboard), 4.1.2 (Name, Role, Value) failure              |

### SKIP

```tsx
function SubmitButton({ onClick, children }: Props) {
  return <button type="submit" onClick={onClick}>{children}</button>;
}
```

| Field  | Value                                               |
| ------ | --------------------------------------------------- |
| Filter | Context Test: native element provides built-in a11y |
| Signal | `<button>` has keyboard, focus, and role by default |

## CHX (reviewer-resilience)

### REPORT

```rust
// src/sync/slack.rs - external API call without resilience controls
async fn fetch_messages(&self, channel: &str) -> Result<Vec<Message>> {
    let response = self.client
        .get(&format!("{}/conversations.history", self.base))
        .send()
        .await?;
    Ok(response.json().await?)
}
```

| Field        | Value                                                                   |
| ------------ | ----------------------------------------------------------------------- |
| Filter       | Harm Test pass - external API without timeout/retry/circuit breaker     |
| Trigger      | Slack API latency > 30s, network partition, or rate limit (429)         |
| Failure      | Caller hangs indefinitely; entire sync pipeline blocks                  |
| Blast radius | service-wide (every caller of `fetch_messages` blocks)                  |
| Hypothesis   | Without explicit timeout, TCP socket waits for OS-level default (~2min) |

### SKIP

```rust
fn clamp(value: i32, min: i32, max: i32) -> i32 {
    value.max(min).min(max)
}
```

| Field  | Value                                                        |
| ------ | ------------------------------------------------------------ |
| Filter | Context Test: pure function, no failure modes                |
| Signal | Deterministic, no I/O, no shared state, no retry path needed |
