# Detection Patterns

## Search Commands

| Pattern                 | Command                                                       |
| ----------------------- | ------------------------------------------------------------- |
| Empty catch             | `rg "catch\s*\([^)]*\)\s*\{\s*\}" --glob "*.{ts,tsx,js,jsx}"` |
| Catch with only comment | `rg "catch\s*\([^)]*\)\s*\{\s*//.*\s*\}" --glob "*.{ts,tsx}"` |
| Promise without catch   | `rg "\.then\([^)]+\)$" --glob "*.{ts,tsx,js,jsx}"`            |
| Console-only handling   | `rg "catch.*console\.(log\|error\|warn)" --glob "*.{ts,tsx}"` |
| Fire and forget         | `rg "(fetch\|axios\|api)\([^)]+\)$" --glob "*.{ts,tsx}"`      |

## Pattern Examples

| Bad Pattern                           | Problem                 | Good Alternative                   |
| ------------------------------------- | ----------------------- | ---------------------------------- |
| `catch (e) { }`                       | Silent failure          | Log + rethrow or handle            |
| `catch (error) { // TODO }`           | TODO never done         | Handle now or remove catch         |
| `catch (_) { }`                       | Underscore doesn't help | Same as above                      |
| `catch (e) { console.log(e) }`        | Logged but not handled  | Add user feedback + error handling |
| `fetchUser(id).then(u => setUser(u))` | No error handling       | Add `.catch(handleError)`          |

## Severity Classification

| Pattern                | Severity | Action              |
| ---------------------- | -------- | ------------------- |
| Empty catch block      | Critical | Immediate fix       |
| Promise without catch  | Critical | Add error handling  |
| Console.log only       | High     | Add user feedback   |
| Fire and forget        | High     | Add await or .catch |
| Missing Error Boundary | High     | Wrap major sections |

## ESLint Rules

```json
{
  "rules": {
    "no-empty": ["error", { "allowEmptyCatch": false }],
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error"
  }
}
```
