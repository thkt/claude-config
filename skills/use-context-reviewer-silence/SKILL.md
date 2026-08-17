---
name: use-context-reviewer-silence
description: Silent failure detection. Do NOT use for security (use-context-reviewer-security) or readability (use-context-reviewer-readability).
when_to_use: silent failure, empty catch, エラーハンドリング, 握りつぶし, swallowed error
allowed-tools: Read Task Bash(ugrep:*) Bash(bfs:*)
agent: reviewer-silence
context: fork
user-invocable: false
---

# Silent Failure Review

## Detection

| ID  | Pattern                          | Fix                                     |
| --- | -------------------------------- | --------------------------------------- |
| SF1 | `catch (e) {}`                   | `catch (e) { logger.error(e); throw }`  |
| SF1 | `catch (e) { console.log(e) }`   | Show user feedback + log context        |
| SF2 | `.then(fn)` without `.catch()`   | Add `.catch()` or use try/catch         |
| SF2 | `async () => { await fn() }`     | Wrap in try/catch, handle error         |
| SF3 | No error UI states               | Add error boundary, feedback component  |
| SF4 | `value ?? defaultValue` silently | Log when using fallback                 |
| SF4 | `data?.nested?.value`            | Check and report if unexpected null     |
| SF5 | `catch { return defaultValue }`  | Log root cause before returning default |
| SF5 | `config.x \|\| fallback`         | Validate config, warn on missing keys   |

## References

| Topic     | File                                                 |
| --------- | ---------------------------------------------------- |
| Detection | ${CLAUDE_SKILL_DIR}/references/detection-patterns.md |
