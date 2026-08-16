# キャリブレーション例

audit reviewer 向けのドメイン別 REPORT/SKIP 例。各 reviewer がこのファイルを参照する。原則は `~/.claude/agents/_lib/finding-schema.md` にある。

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

| Field   | Value                                      |
| ------- | ------------------------------------------ |
| Filter  | Senior Engineer Test pass: 変更を要請する  |
| Trigger | この関数に出会った任意の読み手             |
| Impact  | 5 段ネスト + 6 引数 + 1 文字変数で読めない |

### SKIP

```typescript
function createUser(name: string, email: string): User {
  const normalized = email.toLowerCase().trim();
  const user = { id: generateId(), name, email: normalized, createdAt: new Date() };
  return user;
}
```

| Field  | Value                                                                  |
| ------ | ---------------------------------------------------------------------- |
| Filter | Senior Engineer Test fail: 好みの問題、欠陥ではない                    |
| Signal | `normalized` と `user` は可読性に寄与; inline しても明瞭性は変わらない |

## EFF (reviewer-efficiency)

### REPORT

```rust
fn search(&self, query: &str) -> Vec<Result> {
    let db = Connection::open(&self.db_path).unwrap();  // opens on every call
    let embedding = self.embed(query);
    db.query("SELECT * FROM chunks ORDER BY distance(?, embedding)", [embedding])
}
```

| Field   | Value                                                             |
| ------- | ----------------------------------------------------------------- |
| Filter  | Harm Test pass: ホットパスでの計測可能な無駄                      |
| Trigger | ユーザー検索のたび                                                |
| Impact  | プール再利用ではなく呼び出しごとに新規 DB 接続; レイテンシ + leak |
| Path    | Hot: ユーザー向け関数                                             |

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

| Field  | Value                                                          |
| ------ | -------------------------------------------------------------- |
| Filter | Context Test: cold path                                        |
| Signal | 起動時 1 回実行、env var 2 回読みは無視できる                  |
| Path   | Cold: ユーザー目に見える効果ゼロでキャッシュは複雑度を増すだけ |

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
| Filter      | Harm Test pass: 具体トリガー付きセキュリティリグレッション |
| Trigger     | expiry チェックがリグレッション                            |
| Impact      | 無効 token が静かに通る; auth bypass                       |
| Criticality | 9/10: public API, 認証境界                                 |

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

| Field  | Value                                                                            |
| ------ | -------------------------------------------------------------------------------- |
| Filter | Context Test: indirect coverage                                                  |
| Signal | 2 つの chunker テストがこの helper を介して観測可能挙動を検査済み                |
| Note   | ここの単体テストは `split_whitespace` をテストするだけで、アプリロジックではない |

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

| Field   | Value                                                            |
| ------- | ---------------------------------------------------------------- |
| Filter  | Harm Test pass: 協調更新リスク                                   |
| Trigger | エラーハンドリング変更 (例: ロギング追加やカスタム error 型導入) |
| Impact  | 同一 4 箇所を更新必要; 1 つでも漏れると挙動が不一致になる        |
| Count   | 4 occurrences: Rule of Three の閾値超過                          |

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

| Field  | Value                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| Filter | Context Test: 意味的差異                                                                                            |
| Signal | ドメイン固有のデフォルト (`role: "member"` vs `plan: "free"`) と side effect (`sendWelcomeEmail` vs `notifyAdmins`) |
| Count  | 2 occurrences: Rule of Three 抽出緊急性以下                                                                         |

## SF (reviewer-silence)

### REPORT (error returned as success)

```rust
fn sync_messages(&self, channel: &str) -> Result<usize> {
    match self.client.fetch_history(channel) {
        Ok(messages) => self.store(messages),
        Err(_) => Ok(0),  // caller sees "0 messages synced" - no error signal
    }
}
```

| Field   | Value                                                              |
| ------- | ------------------------------------------------------------------ |
| Filter  | Harm Test pass: 具体的失敗シナリオが存在                           |
| Trigger | Slack API でネットワークエラー、auth 失敗、rate limit              |
| Impact  | caller は `Ok(0)` を見て「0 件同期」と「API ダウン」を区別できない |

### SKIP (intentional default)

```rust
fn load_config(path: &Path) -> Config {
    match fs::read_to_string(path) {
        Ok(content) => toml::from_str(&content).unwrap_or_default(),
        Err(_) => Config::default(),  // first run - config file doesn't exist yet
    }
}
```

| Field  | Value                                                                |
| ------ | -------------------------------------------------------------------- |
| Filter | Context Test: 意図的 fallback                                        |
| Signal | 関数名 `load_config` (`require_config` ではない)、`default()` を返す |
| Path   | Cold: 起動時 1 回実行                                                |

### REPORT (catch as dispatch)

```javascript
const sibling = async (name, args) => {
  try {
    return await workflow(name, args);
  } catch {
    return await workflow(`build:${name}`, args); // fires on any error, not just an unresolved name
  }
};
```

| Field   | Value                                                          |
| ------- | -------------------------------------------------------------- |
| Filter  | Harm Test pass: 具体的失敗シナリオが存在                       |
| Trigger | 入れ子の workflow が名前解決以外の理由で throw する            |
| Impact  | 退避先の名前解決エラーが最終の失敗として残り、真の原因が消える |

### SKIP (single failure mode)

```javascript
function parseCache(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {}; // malformed cache is the only way to reach here
  }
}
```

| Field  | Value                                                                       |
| ------ | --------------------------------------------------------------------------- |
| Filter | Context Test: try 内の失敗経路が 1 本                                       |
| Signal | try 内の呼び出しは 1 つで throw も 1 通りなので、catch が別の原因を覆えない |

## SEC (reviewer-security)

### REPORT

```typescript
app.get("/users", async (req, res) => {
  const sort = req.query.sort;
  const users = await db.query(`SELECT * FROM users ORDER BY ${sort}`);
  res.json(users);
});
```

| Field   | Value                                    |
| ------- | ---------------------------------------- |
| Filter  | Harm Test pass: 悪用可能な SQL injection |
| Trigger | `?sort=1; DROP TABLE users--`            |
| Impact  | 任意 SQL 実行; DB 全体侵害               |

### SKIP

```typescript
const ALLOWED_SORTS = ["name", "created_at", "email"] as const;

app.get("/users", async (req, res) => {
  const sort = ALLOWED_SORTS.includes(req.query.sort) ? req.query.sort : "name";
  const users = await db.query(`SELECT * FROM users ORDER BY ${sort}`);
  res.json(users);
});
```

| Field  | Value                                                             |
| ------ | ----------------------------------------------------------------- |
| Filter | Context Test: allowlist による検証                                |
| Signal | `ALLOWED_SORTS.includes()` が補間前にユーザー入力をゲートしている |

## RP (reviewer-react-pattern)

### REPORT (肥大コンポーネント)

```tsx
function OrderPage() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("date");

  useEffect(() => {
    fetch("/api/orders")
      .then((r) => r.json())
      .then(setOrders);
  }, []);

  const filtered = orders.filter((o) => o.name.includes(filter));
  const sorted = filtered.sort((a, b) => (a[sort] > b[sort] ? 1 : -1));

  return (
    <div>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} />
      <select value={sort} onChange={(e) => setSort(e.target.value)}>
        <option value="date">Date</option>
        <option value="name">Name</option>
      </select>
      {sorted.map((o) => (
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

| Field   | Value                                                          |
| ------- | -------------------------------------------------------------- |
| Filter  | Harm Test pass: fetch + filter + sort + render を 1 箇所に集約 |
| Trigger | 新規フィルタ種類追加でレンダリングコード変更が必要             |
| Impact  | テスト不能ロジック; render と state が結合; 際限なく成長       |

### SKIP (leaf component)

```tsx
function UserAvatar({ name, src }: { name: string; src: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("");
  return <img src={src} alt={initials} onError={(e) => (e.target.textContent = initials)} />;
}
```

| Field  | Value                                                          |
| ------ | -------------------------------------------------------------- |
| Filter | Context Test: 単一責務、leaf component                         |
| Signal | `initials` 導出は些末; hook 抽出はオーバーヘッドにしかならない |

### REPORT (prop-forwarding)

```tsx
interface SegmentedControlProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  onChange: (value: string) => void;
  label: string;
}

export function SegmentedControl({ value, onChange, label }: SegmentedControlProps) {
  return (
    <div role="radiogroup" aria-label={label}>
      {/* ...items */}
    </div>
  );
}
```

| Field   | Value                                                                        |
| ------- | ---------------------------------------------------------------------------- |
| Filter  | Harm Test pass: HTMLAttributes を継承しながら `...rest` を分割代入していない |
| Trigger | consumer が渡す `data-testid`、`aria-describedby`、`id` が DOM に出ない      |
| Impact  | 型検査も描画も通るため、consumer 側が参照するまで欠落が表面化しない          |

### SKIP (閉じた props)

```tsx
interface IconProps {
  name: IconName;
  size?: "sm" | "md";
}

export function Icon({ name, size = "md" }: IconProps) {
  return <svg {...registry[name]} data-size={size} />;
}
```

| Field  | Value                                                    |
| ------ | -------------------------------------------------------- |
| Filter | Context Test: props 型が DOM 属性を継承していない        |
| Signal | pass-through の契約が無いので、rest 未捕捉は欠落ではない |

## DP (reviewer-design)

### REPORT (shallow, React)

```tsx
const ButtonWrapper = (props: ButtonProps) => <Button {...props} />;
```

| Field   | Value                                                                         |
| ------- | ----------------------------------------------------------------------------- |
| Filter  | Deletion test: 削除すると全呼び出し箇所で `<Button>` に潰れ、ロジック損失なし |
| Trigger | component が自前の state/effect/導出なしに props を 1:1 転送                  |
| Impact  | 挙動を何も隠さずに間接層を 1 つ追加                                           |

### REPORT (shallow, Rust)

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

| Field  | Value                                                                               |
| ------ | ----------------------------------------------------------------------------------- |
| Filter | Deletion test: 削除すると全 caller が fetch+state+rule+lifecycle を再実装させられる |
| Signal | 2 hook を集約し view-model を導出、ドメインルール (shipped はキャンセル不可) を内包 |

### SKIP (deep, Rust)

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
| Filter  | Harm Test pass: テストで制御できない隠れた global 3 つ             |
| Trigger | timestamp、HTTP 呼び出し、ロギングのテストは global の mock が必要 |
| Impact  | テストが flaky (時間依存) または複雑なセットアップが必要           |

### SKIP

```typescript
function formatCurrency(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "JPY" }).format(amount);
}
```

| Field  | Value                                                   |
| ------ | ------------------------------------------------------- |
| Filter | Context Test: 純粋関数、隠れた依存なし                  |
| Signal | `Intl.NumberFormat` は決定的; input/output でテスト可能 |

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

| Field   | Value                                                                                   |
| ------- | --------------------------------------------------------------------------------------- |
| Filter  | Harm Test pass: CSS media query で完全代替可能                                          |
| Trigger | window resize ごとに JS handler が発火                                                  |
| Impact  | `@media (max-width: 768px) { .sidebar { display: none } }`: JS ゼロでパフォーマンス向上 |

### SKIP

```javascript
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      loadMoreItems();
      observer.unobserve(entry.target);
    }
  });
});
observer.observe(sentinelRef.current);
```

| Field  | Value                                                             |
| ------ | ----------------------------------------------------------------- |
| Filter | Context Test: スクロール時のデータ取得に CSS 等価物なし           |
| Signal | IntersectionObserver が API 呼び出しをトリガ; CSS では fetch 不可 |

## OPS (reviewer-operations)

### REPORT

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

### SKIP

```tsx
function PriceTag({ amount }: { amount: number }) {
  return <span>{formatCurrency(amount)}</span>;
}
```

| Field  | Value                                             |
| ------ | ------------------------------------------------- |
| Filter | Context Test: 内部 presentational、親がエラー処理 |
| Signal | async なし、副作用なし; 親 ErrorBoundary がカバー |

## RC (reviewer-causation)

### REPORT (retry が原因を隠す)

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

### SKIP (意図的な transient retry)

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

| Field   | Value                                                                 |
| ------- | --------------------------------------------------------------------- |
| Filter  | Harm Test pass: 段落が cold-cache miss の 0 偽装を正当化              |
| Trigger | cold cache が undefined を返し、呼び出し元が miss でなく残高 0 を見る |
| Impact  | 誤った残高を実値として表示; コメントが contract 修正でなく近道を弁護  |

### SKIP (justification camouflage)

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

| Field   | Value                                              |
| ------- | -------------------------------------------------- |
| Filter  | Harm Test pass: 同一ロジックの再実装               |
| Trigger | email 検証ルール変更 (例: + alias 許可)            |
| Impact  | 一方を更新してもう一方を忘れる; 検証が不整合になる |

### SKIP

```typescript
// src/features/billing/validate.ts - new code
function validateInvoiceDate(date: Date, billingCycle: BillingCycle): boolean {
  const cycleStart = billingCycle.startDate;
  const grace = billingCycle.gracePeriodDays;
  return date >= cycleStart && date <= addDays(cycleStart, grace);
}
```

| Field  | Value                                              |
| ------ | -------------------------------------------------- |
| Filter | Context Test: 既存等価物のないドメイン特化ロジック |
| Signal | billing cycle 検証はこの機能固有                   |

## PQ (reviewer-prompt)

### REPORT

```markdown
When you encounter a situation where the user has provided input that needs to be validated, you should first check whether the input conforms to the expected format.
If it does not conform, you should return an appropriate error message.
If it does conform, you should proceed with processing the input according to the rules defined below.
```

| Field   | Value                                  |
| ------- | -------------------------------------- |
| Filter  | Harm Test pass: 4 行の散文 = 1 表行    |
| Trigger | LLM が 2 列ルールに ~60 トークンを読む |
| Impact  | 等価な 2 列表行で 50+ トークン削減     |

### SKIP

```markdown
This reviewer detects silent failures - errors that are caught but not surfaced to the user or logged for operators.
```

| Field  | Value                                                  |
| ------ | ------------------------------------------------------ |
| Filter | Context Test: 詳細な表の前の 2 行イントロ              |
| Signal | 簡潔なコンテキスト設定散文; 表に変えても何も得られない |

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
          {items.map((item) => (
            <li key={item.id} onClick={() => onSelect(item)}>
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

| Field   | Value                                                                  |
| ------- | ---------------------------------------------------------------------- |
| Filter  | Harm Test pass: キーボードと screen reader でアクセス不可              |
| Trigger | Tab key で dropdown を skip; screen reader が "listbox" でなく "group" |
| Impact  | WCAG 2.1.1 (Keyboard), 4.1.2 (Name, Role, Value) 違反                  |

### SKIP

```tsx
function SubmitButton({ onClick, children }: Props) {
  return (
    <button type="submit" onClick={onClick}>
      {children}
    </button>
  );
}
```

| Field  | Value                                                  |
| ------ | ------------------------------------------------------ |
| Filter | Context Test: ネイティブ要素が組み込み a11y を提供     |
| Signal | `<button>` はデフォルトで keyboard, focus, role を持つ |

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

| Field        | Value                                                           |
| ------------ | --------------------------------------------------------------- |
| Filter       | Harm Test pass: timeout/retry/circuit breaker なしの外部 API    |
| Trigger      | Slack API レイテンシ > 30s、network partition、rate limit (429) |
| Failure      | caller が無期限ハング; sync pipeline 全体がブロック             |
| Blast radius | service-wide (`fetch_messages` の全 caller がブロック)          |
| Hypothesis   | 明示 timeout なしで TCP socket は OS デフォルト (~2min) を待つ  |

### SKIP

```rust
fn clamp(value: i32, min: i32, max: i32) -> i32 {
    value.max(min).min(max)
}
```

| Field  | Value                                           |
| ------ | ----------------------------------------------- |
| Filter | Context Test: 純粋関数、failure mode なし       |
| Signal | 決定的、I/O なし、共有状態なし、retry path 不要 |
