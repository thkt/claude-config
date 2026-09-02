# RP (reviewer-react-pattern)

## REPORT (肥大コンポーネント)

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

## SKIP (leaf component)

```tsx
function UserAvatar({ name, src }: { name: string; src: string }) {
  const initials = name.split(" ").map((n) => n[0]).join("");
  return <img src={src} alt={initials} onError={(e) => (e.target.textContent = initials)} />;
}
```

| Field  | Value                                                          |
| ------ | -------------------------------------------------------------- |
| Filter | Context Test: 単一責務、leaf component                         |
| Signal | `initials` 導出は些末; hook 抽出はオーバーヘッドにしかならない |

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

| Field   | Value                                                                        |
| ------- | ---------------------------------------------------------------------------- |
| Filter  | Harm Test pass: HTMLAttributes を継承しながら `...rest` を分割代入していない |
| Trigger | consumer が渡す `data-testid`、`aria-describedby`、`id` が DOM に出ない      |
| Impact  | 型検査も描画も通るため、consumer 側が参照するまで欠落が表面化しない          |

## SKIP (閉じた props)

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
