---
name: test
description: 実装コードの品質を包括的なテストで保証
priority: high
suitable_for:
  scale: [small, medium, large]
  type: [test]
  understanding: "≥ 70%"
  urgency: [low, medium]
aliases: []
timeout: 120
context:
  files_changed: "none"
  lines_changed: "0"
  new_features: false
  breaking_changes: false
---

# /test - Testing and Verification

## Purpose

Ensure code quality through comprehensive testing and verification.

## Usage

Run tests after implementation to verify functionality and catch regressions.

## Execution Strategy

### 1. Discover Test Commands

- Check package.json for test scripts
- Look for test configuration files
- Identify testing framework (Jest, Vitest, etc.)

### 2. TodoWrite Integration

Track test execution:

```md
# Testing: [feature/fix description]
1. ⏳ Discover test commands
2. ⏳ Run unit tests
3. ⏳ Run integration tests (if available)
4. ⏳ Verify quality checks
5. ⏳ Review coverage
```

### 3. Test Types

- **Unit Tests**: Individual components/functions
- **Integration Tests**: Component interactions
- **E2E Tests**: Full user workflows (if available)

### 4. Browser Testing (UI Changes)

When UI is affected, use Playwright MCP tools to:

- Verify visual appearance
- Test interactive functionality
- Check responsive design
- Validate accessibility

### 5. Quality Checks

- Run linter (if available)
- Run type checking (for TypeScript projects)
- Check test coverage metrics
- Verify no regressions introduced

## Test Execution Process

1. **Discovery Phase**
   - Find available test commands
   - Identify test files pattern
   - Check for CI/CD configuration

2. **Execution Phase**
   - Run tests in appropriate order
   - Capture and analyze results
   - Identify failures

3. **Resolution Phase**
   - If tests fail → investigate root cause
   - Apply fixes → re-run tests
   - Repeat until all pass

## Output Format

```markdown
## Test Results
- Tests Run: [count]
- Passed: [count]
- Failed: [count]
- Coverage: [percentage]

## Failed Tests (if any)
[List of failures with reasons]

## Next Actions
[Prioritized fixes needed]
```

## When to Use

- After implementing new features
- After fixing bugs
- Before creating pull requests
- When refactoring code

## When NOT to Use

- During active development (too disruptive)
- For documentation changes only
- When no test infrastructure exists

## Example Usage

```md
/test "Run tests for authentication changes"
/test "Verify payment processing fixes"
/test "Full test suite before release"
```

## Tips

1. **Start with unit tests** - fastest feedback
2. **Fix failures immediately** - don't let them accumulate
3. **Monitor coverage trends** - aim for improvement
4. **Use appropriate test level** - not everything needs E2E

## Next Steps

- Failed tests → `/fix` to address issues
- All passing → Ready for PR or deployment
- Low coverage → Write additional tests
