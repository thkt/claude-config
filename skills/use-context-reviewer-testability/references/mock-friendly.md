# Mock-Friendly Design

## Interface Pattern

| Without Interface               | With Interface                      |
| ------------------------------- | ----------------------------------- |
| `new PostgresDB()` inside class | `constructor(private db: Database)` |
| Hard to mock                    | Easy mock via interface             |

```typescript
interface UserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

// Test
const mockRepo: UserRepository = {
  findById: jest.fn().mockResolvedValue({ id: "1", name: "Test" }),
  save: jest.fn(),
};
```

## Factory Pattern

```typescript
function createAuthService(deps: { http: HttpClient; storage: Storage }) {
  return {
    login: (creds) => deps.http.post("/auth", creds),
    getToken: () => deps.storage.get("token"),
  };
}

// Test
const service = createAuthService({
  http: mockHttp,
  storage: mockStorage,
});
```

## React Testing

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

### MSW for API

```typescript
const server = setupServer(
  rest.get("/api/users/:id", (req, res, ctx) => res(ctx.json({ id: req.params.id, name: "Test" }))),
);
```

## Time Mocking

```typescript
// Inject time as parameter
function isExpired(expiry: Date, now = new Date()): boolean {
  return now > expiry;
}

// Test
expect(isExpired(new Date("2024-01-01"), new Date("2024-01-02"))).toBe(true);
```

## Checklist

| Check             | Requirement              |
| ----------------- | ------------------------ |
| External services | Interface defined        |
| Complex objects   | Factory function         |
| React providers   | Test wrapper available   |
| Time-dependent    | Injectable now parameter |
