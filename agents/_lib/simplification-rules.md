# Simplification Rules

The removal targets, simplification rules, and test audit smells that enhancer-code applies. The Preservation Rules in the agent body win on any conflict with a row below.

## Removal Targets (AI Slop)

| Category           | Examples                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Redundant comments | HOW comments restating code, WHY comments restating already-named identifiers, removed-code markers, `// added for X` stubs |
| Defensive excess   | Internal-only validation, unreachable error handling                                                                        |
| Over-engineering   | Single-impl interfaces, wrapper classes, one-time helpers                                                                   |
| Complexity         | Nested ternaries, deep nesting (>3), functions >50 lines                                                                    |
| Meaningless tests  | Tautology, duplicate assertions, empty/skipped, self-mocking                                                                |
| Redundant tests    | Copy-pasted cases with trivial variation, same behavior tested repeatedly                                                   |
| Verbose tests      | Repeated setup across tests, excessive assertions for one behavior                                                          |
| Trivial tests      | Testing getters/setters, framework defaults, type guards at runtime                                                         |
| Dead code          | Unused imports, unreferenced variables, commented-out code                                                                  |
| Backwards-compat   | Renamed `_vars`, re-exports of removed code, `// removed` stubs                                                             |

## Simplification Rules

| Rule                  | Action                             |
| --------------------- | ---------------------------------- |
| Nested ternary        | Replace with if/else or switch     |
| Single-use helper     | Inline at call site                |
| Wrapper with no logic | Remove wrapper, use inner directly |
| Inferable types (TS)  | Remove redundant type annotations  |
| let never reassigned  | Change to const                    |
| Unused imports        | Remove                             |
| Nesting > 3 levels    | Extract or use early return        |

## Test Audit

| Smell                                     | Fix                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Vague test names                          | 3-part: what / scenario / expected                                                                   |
| Mixed AAA phases                          | Separate Arrange, Act, Assert with blank lines                                                       |
| Copy-pasted test cases                    | Consolidate with `test.each` / parameterized                                                         |
| Duplicate setup across tests              | Extract to `beforeEach` or shared helper                                                             |
| Multiple assertions same path             | Reduce to minimal covering set                                                                       |
| Verbose assertion chains                  | Use targeted matchers (`toMatchObject`, etc.)                                                        |
| Over-mocked internals                     | Test behavior via public API, remove impl mocks                                                      |
| Contract-pinning test flagged for removal | Rewrite to a concrete literal (wire format, authz, allowlist, cross-module invariant); do not delete |
