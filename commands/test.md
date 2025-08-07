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
allowed-tools: Bash(npm test:*), Bash(npm run:*), Bash(yarn test:*), Bash(pnpm test:*), Bash(jest:*), Bash(vitest:*), Bash(pytest:*), Read, Glob, Grep, LS, Task
context:
  files_changed: "dynamic"
  lines_changed: "dynamic"
  test_coverage: "measured"
  test_results: "analyzed"
---

# /test - Advanced Testing & Verification

## Purpose

Ensure code quality through comprehensive testing with dynamic discovery, hierarchical analysis, and coverage metrics.

## Dynamic Test Discovery

### Available Test Scripts

List available test-related npm scripts:

```bash
npm run 2>&1 | grep -E "test|spec|check|lint|type"
```

### Package Manager Detection

Detect which package manager is used:

```bash
ls package-lock.json yarn.lock pnpm-lock.yaml 2>/dev/null | head -1
```

### Test Framework Detection

Identify test frameworks:

```bash
cat package.json | grep -E "jest|vitest|mocha|jasmine|karma|cypress|playwright"
```

### Test Files Count

Count test files:

```bash
find . -type f \( -name "*.test.*" -o -name "*.spec.*" \) -not -path "*/node_modules/*" | wc -l
```

## Hierarchical Testing Process

### Phase 1: Environment Analysis

Use Task agent to:

1. Detect testing infrastructure and frameworks
2. Identify test file patterns and locations
3. Discover available test commands and scripts
4. Check for coverage configuration

### Phase 2: Parallel Test Execution

Execute test suites concurrently when possible:

- **Unit Tests**: Fastest feedback on component logic
- **Integration Tests**: API and service interactions
- **E2E Tests**: Critical user paths (if configured)
- **Quality Checks**: Linting, type checking, formatting

### Phase 3: Result Analysis & Metrics

Analyze results with confidence scoring:

1. **Failure Analysis**: Root cause identification
2. **Coverage Metrics**: Line, branch, function coverage
3. **Performance Data**: Test execution times
4. **Flaky Test Detection**: Intermittent failures

## Test Execution Strategies

### Quick Test (1-2 min)

Focus on changed files only:

```bash
npm test -- --findRelatedTests $(git diff --name-only HEAD)
```

Command: `/test --quick`

### Standard Test (3-5 min)

Run main test suite:

```bash
npm test
# or yarn test
# or pnpm test
```

Command: `/test` (default)

### Comprehensive Test (5-10 min)

Full test suite with coverage:

```bash
npm test -- --coverage --verbose
# or npm run test:all
```

Command: `/test --full`

### Watch Mode

For development iteration:

```bash
npm test -- --watch
```

Command: `/test --watch`

## Coverage Metrics

### Current Coverage

View coverage metrics:

```bash
cat coverage/coverage-summary.json | grep -E "lines|statements|functions|branches"
```

### Coverage Trends

Track coverage changes:

- Compare against main branch
- Monitor coverage trajectory
- Identify uncovered critical paths

### Coverage Thresholds

```json
{
  "lines": 80,
  "functions": 80,
  "branches": 75,
  "statements": 80
}
```

## Test Result Analysis

### Failure Categorization

```markdown
## Test Results Summary
- Total Tests: [count]
- ✅ Passed: [count] ([percentage]%)
- ❌ Failed: [count]
- ⏭️ Skipped: [count]
- ⏱️ Duration: [time]

## Failed Tests Analysis
### Category: [Unit|Integration|E2E]
#### Test: [test name]
- **File**: path/to/test.js:42
- **Failure Type**: [Assertion|Timeout|Error]
- **Root Cause**: [Analysis]
- **Confidence**: 0.95
- **Fix Suggestion**: [Specific solution]

## Coverage Report
- 📊 Line Coverage: [percentage]% (↑/↓ from main)
- 🌿 Branch Coverage: [percentage]%
- 🔧 Function Coverage: [percentage]%
- 📝 Statement Coverage: [percentage]%

## Uncovered Critical Paths
[List of important untested code]

## Performance Metrics
- Slowest Tests: [Top 5 with times]
- Flaky Tests: [Intermittent failures]
- Test Efficiency: [Tests per second]
```

## Quality Checks Integration

### Linting

Run linter:

```bash
npm run lint
```

### Type Checking

Check types:

```bash
npm run type-check
# or npx tsc --noEmit
```

### Format Checking

Check formatting:

```bash
npm run format:check
```

## Browser Testing for UI Changes

When UI components are modified:

1. Use Playwright MCP tools for visual testing
2. Verify responsive design breakpoints
3. Check accessibility compliance
4. Test cross-browser compatibility

## TodoWrite Integration

Automatic task tracking:

```markdown
# Testing: [Target Description]
1. ⏳ Discover test infrastructure (1 min)
2. ⏳ Execute unit tests (parallel)
3. ⏳ Execute integration tests (if exists)
4. ⏳ Analyze failures and root causes
5. ⏳ Generate coverage report
6. ⏳ Run quality checks (lint, type-check)
7. ⏳ Summarize results and recommendations
```

## Advanced Features

### Test Impact Analysis

Determine which tests to run based on changes:

```bash
npm test -- --findRelatedTests $(git diff --cached --name-only)
```

### Mutation Testing

For critical code paths (if configured):

```bash
npm run test:mutation
```

### Performance Regression Testing

Track test suite performance over time:

- Identify slow tests
- Monitor memory usage
- Detect performance regressions

### Test Reliability Scoring

- Track flaky test frequency
- Calculate test confidence scores
- Prioritize test maintenance

## Failure Recovery Strategies

### Immediate Actions

1. **Isolate Failure**: Run single test in isolation
2. **Debug Mode**: Run with verbose output
3. **Check Dependencies**: Verify test environment
4. **Review Changes**: Compare with last passing state

### Root Cause Analysis

- Stack trace analysis
- Assertion failure patterns
- Environment dependencies
- Timing/race conditions

## CI/CD Integration

### Pre-commit Hook

```bash
npm test -- --bail --findRelatedTests
```

### PR Validation

```yaml
- name: Test Suite
  run: npm test -- --coverage --ci
```

### Deployment Gate

```bash
npm test -- --coverage --threshold 80
```

## Usage Examples

### Basic Testing

```bash
/test
# Runs standard test suite with coverage
```

### Quick Feedback

```bash
/test --quick
# Tests only changed files
```

### Pre-PR Validation

```bash
/test --full
# Comprehensive testing before PR
```

### Specific Test Suite

```bash
/test "authentication tests"
# Runs tests matching pattern
```

### With Coverage Goals

```bash
/test --coverage 90
# Ensures 90% coverage threshold
```

## Best Practices

1. **Test First**: Run tests before committing
2. **Fix Immediately**: Don't accumulate test debt
3. **Monitor Trends**: Track coverage over time
4. **Optimize Suite**: Remove redundant tests
5. **Document Failures**: Keep failure patterns log
6. **Parallelize**: Run independent tests concurrently

## Exclusion Rules

### Auto-Skip Patterns

1. **Generated Files**: dist/, build/, coverage/
2. **Dependencies**: node_modules/, vendor/
3. **Documentation**: *.md files (unless docs tests exist)
4. **Config Files**: Unless specifically testing config
5. **Mock Data**: Test fixtures and stubs

### Context-Aware Skipping

- Skip E2E in CI when not needed
- Skip slow tests in watch mode
- Skip integration tests in quick mode

## Next Steps

- **Failed Tests** → `/fix` with specific test context
- **Low Coverage** → Add tests for critical paths
- **Performance Issues** → Optimize slow tests
- **Flaky Tests** → Investigate and stabilize
- **All Passing** → Ready for PR/deployment
