# Writing Tests

Read this when writing tests in Red, and when reorganizing tests in Refactor.

## Test Design

| Technique                | Use For               | Example                |
| ------------------------ | --------------------- | ---------------------- |
| Equivalence Partitioning | Group same behavior   | Age is <18 and 18-120  |
| Boundary Value           | Test edges            | 17, 18, 120, 121       |
| Decision Table           | Multi-condition logic | isLoggedIn × isPremium |

## Assertion Quality

Every test must verify a specific outcome. Weak assertions alone are forbidden. Bad is `expect(result).toBeTruthy()`; good is `expect(result).toEqual({ id: 1, name: "Alice" })`. One test carries one concept. If two tests assert the same function with the same argument pattern, merge or parameterize with `test.each`.

| Category           | Matchers                                                                | When acceptable                                   |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------- |
| Weak (existence)   | toBeTruthy, toBeDefined, toBeFalsy, toBeNull, toBeUndefined             | Only with a meaningful assertion in the same test |
| Meaningful (value) | toBe, toEqual, toStrictEqual, toMatch, toContain, toThrow, toHaveLength | Always preferred                                  |
| Meaningful (call)  | toHaveBeenCalledWith, toHaveBeenCalledTimes, toHaveReturnedWith         | When verifying side effects                       |

## Mock

Mock at system boundaries. External APIs, databases, file system, network, non-deterministic dependencies such as time and random, and slow dependencies that block the 2-min cycle.

| Rule                | Threshold                        |
| ------------------- | -------------------------------- |
| Mock count per test | Must not exceed assertion count  |
| Mock scope          | External dependencies only       |
| Mock target         | Never mock the module under test |

| Anti-Pattern                | Problem                                     | Instead                                    |
| --------------------------- | ------------------------------------------- | ------------------------------------------ |
| Assert mock was called      | Tests mock behavior, not component behavior | Assert on observable output or side effect |
| Test-only production method | Pollutes production API for test access     | Extract to test utility or use public API  |
| Mock before understanding   | Hides real dependency behavior              | Understand dependency first, then mock     |
| Partial mock structure      | Missing fields cause false passes           | Mirror complete real API structure         |
| Mock overuse                | More mocks than assertions = testing wiring | Reduce mocks or add meaningful assertions  |

### UT Isolation

Unit tests import only the target module, types, and test infrastructure. Build test data from types or literals.

## Test Construction

### AAA Pattern

```typescript
test("name", () => {
  // Arrange - Setup
  // Act - Execute
  // Assert - Verify
});
```

### Naming

| Level | Pattern                                          |
| ----- | ------------------------------------------------ |
| Suite | `describe("[Target]", ...)`                      |
| Group | `describe("[Method]", ...)`                      |
| Test  | `it("when [condition], should [expected]", ...)` |

## Framework Detection

| Condition          | Framework |
| ------------------ | --------- |
| `vitest` in deps   | Vitest    |
| `jest` in deps     | Jest      |
| `bun` as runtime   | Bun test  |
| No framework found | Vitest    |
