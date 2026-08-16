# 制御フローと複雑度

## ネストルール

| 手法         | Before (悪い)                          | After (良い)                          |
| ------------ | -------------------------------------- | ------------------------------------- |
| guard clause | `if (a) { if (b) { if (c) { ... } } }` | `if (!a) return; if (!b) return; ...` |
| early return | ネストした if-else で最深部に結果      | 順次 if-return                        |
| ロジック抽出 | `if (a && b && !c && d === 'X') { }`   | `if (canAccessContent(user)) { }`     |

## コード例

### Guard Clause

```typescript
// 悪い (4 階層)
function process(order) {
  if (order) {
    if (order.isValid) {
      if (order.user) {
        if (order.user.hasPermission) {
          /*...*/
        }
      }
    }
  }
}

// 良い (1 階層)
function process(order) {
  if (!order) return;
  if (!order.isValid) return;
  if (!order.user?.hasPermission) return;
  // Process order
}
```

### 条件分岐よりデータ構造

```typescript
// 悪い (7 分岐)
function getStatus(code) {
  if (code === "A") return "Active";
  if (code === "P") return "Pending";
  // ... 5 more
}

// 良い (lookup)
const STATUS_MAP = { A: "Active", P: "Pending" /*...*/ };
const getStatus = (code) => STATUS_MAP[code] || "Unknown";
```

## チェックリスト

| 項目   | 上限 | 超過時のアクション               |
| ------ | ---- | -------------------------------- |
| 引数   | ≤ 5  | パラメータオブジェクトを使う     |
| ネスト | ≤ 3  | guard clause を使う              |
| 分岐   | ≤ 5  | データ構造 / map を使う          |
| 長さ   | ≤ 15 | 小さい関数に抽出                 |
| 条件   | -    | 名前付き関数に抽出               |
| フロー | -    | 巧妙なトリックを避け、明白に書く |
