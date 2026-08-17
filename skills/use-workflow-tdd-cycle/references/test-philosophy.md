# Test Philosophy

Read this when unsure whether a written test verifies behavior rather than implementation, and when unsure which variant to select.

## Classical/Detroit

| Principle                    | Rule                                                      |
| ---------------------------- | --------------------------------------------------------- |
| Behavior over implementation | Test public API output, not internal calls                |
| State verification           | Assert on result values, not "was X called"               |
| Real objects first           | Use real dependencies. Mock only external I/O             |
| Black-box perspective        | Treat the unit as a black box via its public interface    |
| Sociable tests               | Let collaborators participate. Isolate only at boundaries |

## Feature-Driven vs Bug-Driven

| Aspect     | Feature-Driven              | Bug-Driven            |
| ---------- | --------------------------- | --------------------- |
| Trigger    | Specification               | Bug report            |
| Test state | Skip state initially        | Active                |
| Test count | All tests generated upfront | 1 main + edge cases   |
| Activation | User-controlled             | Immediate             |
| Focus      | Feature completion          | Regression prevention |
