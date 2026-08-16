# Mock-Friendly な設計

## Interface パターン

| Interface なし                | Interface あり                      |
| ----------------------------- | ----------------------------------- |
| クラス内の `new PostgresDB()` | `constructor(private db: Database)` |
| mock しにくい                 | interface 経由で容易に mock         |

```typescript
interface UserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

// テスト
const mockRepo: UserRepository = {
  findById: jest.fn().mockResolvedValue({ id: "1", name: "Test" }),
  save: jest.fn(),
};
```

## Factory パターン

```typescript
function createAuthService(deps: { http: HttpClient; storage: Storage }) {
  return {
    login: (creds) => deps.http.post("/auth", creds),
    getToken: () => deps.storage.get("token"),
  };
}

// テスト
const service = createAuthService({
  http: mockHttp,
  storage: mockStorage,
});
```

## React テスト

### Test Wrapper

```typescript
function createWrapper(overrides = {}) {
  return ({ children }) => (
    <ServicesProvider services={{ ...defaultMocks, ...overrides }}>
      {children}
    </ServicesProvider>
  )
}

render(<Component />, { wrapper: createWrapper({ api: mockApi }) })
```

### API には MSW

```typescript
const server = setupServer(
  rest.get("/api/users/:id", (req, res, ctx) => res(ctx.json({ id: req.params.id, name: "Test" }))),
);
```

## 時刻のモック

```typescript
// 時刻をパラメータとして注入
function isExpired(expiry: Date, now = new Date()): boolean {
  return now > expiry;
}

// テスト
expect(isExpired(new Date("2024-01-01"), new Date("2024-01-02"))).toBe(true);
```

## チェックリスト

| チェック           | 要件                           |
| ------------------ | ------------------------------ |
| 外部サービス       | interface を定義               |
| 複雑なオブジェクト | Factory 関数                   |
| React provider     | Test wrapper を用意            |
| 時刻依存           | now パラメータを注入可能にする |
