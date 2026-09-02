# RP (reviewer-react-pattern)

## REPORT (massive component)

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

| Field   | Value                                                         |
| ------- | ------------------------------------------------------------- |
| Filter  | Harm Test pass - fetch + filter + sort + render all in one    |
| Trigger | Adding a new filter type requires editing rendering code      |
| Impact  | Untestable logic; render-coupled state; growing without bound |

## SKIP (leaf component)

```tsx
function UserAvatar({ name, src }: { name: string; src: string }) {
  const initials = name.split(" ").map((n) => n[0]).join("");
  return <img src={src} alt={initials} onError={(e) => (e.target.textContent = initials)} />;
}
```

| Field  | Value                                                           |
| ------ | --------------------------------------------------------------- |
| Filter | Context Test: single responsibility, leaf component             |
| Signal | Deriving `initials` is trivial; extracting a hook adds overhead |

## REPORT (prop-forwarding)

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

| Field   | Value                                                                          |
| ------- | ------------------------------------------------------------------------------ |
| Filter  | Harm Test pass: extends HTMLAttributes but never destructures `...rest`        |
| Trigger | A consumer's `data-testid`, `aria-describedby`, `id` never reach the DOM       |
| Impact  | Type-checks and renders, so the gap stays hidden until a consumer looks for it |

## SKIP (closed props)

```tsx
interface IconProps {
  name: IconName;
  size?: "sm" | "md";
}

export function Icon({ name, size = "md" }: IconProps) {
  return <svg {...registry[name]} data-size={size} />;
}
```

| Field  | Value                                                            |
| ------ | ---------------------------------------------------------------- |
| Filter | Context Test: the props type does not extend DOM attributes      |
| Signal | No pass-through contract exists, so an uncaptured rest is no gap |
