---
name: code
description: 計画に基づいてコードを記述（TDD推奨）
priority: high
suitable_for:
  scale: [small, medium, large]
  type: [feature, refactor, fix]
  understanding: "≥ 70%"
  urgency: [low, medium]
aliases: [implement, impl]
timeout: 120
allowed-tools: Bash(npm run:*), Bash(yarn:*), Bash(pnpm:*), Bash(make:*), Bash(git status:*), Edit, MultiEdit, Write, Read, Glob, Grep, LS, TodoWrite
context:
  files_changed: "dynamic"
  lines_changed: "tracked"
  test_status: "real-time"
  quality_checks: "discovered"
  confidence_level: "scored"
---

# /code - Advanced Implementation with Dynamic Quality Assurance

## Purpose

Perform code implementation with real-time test feedback, dynamic quality discovery, and confidence-scored decisions.

## Usage Modes

- **Standalone**: Implement specific features or bug fixes
- **Workflow**: Code based on `/research` results, then proceed to `/test`

## Prerequisites (Workflow Mode)

- SOW created in `/think`
- Technical research completed in `/research`
- For standalone use, implementation details must be clear

## Dynamic Project Context

### Current Implementation State
Check git status:
```bash
git status --porcelain | head -10
```

### Quality Commands Available
Find quality scripts:
```bash
npm run 2>&1 | grep -E "lint|type|check|test|format"
```

### Test Framework Detection
Detect test framework:
```bash
cat package.json | grep -E '"(jest|vitest|mocha|cypress|playwright)"'
```

### Code Conventions
Check code style configs:
```bash
ls -la .eslintrc* .prettierrc* tsconfig.json
```

### Recent Related Changes
Find related commits:
```bash
git log --oneline -5 --grep="[feature]"
```

## Implementation Principles

### Applied Development Rules

- [@~/.claude/rules/development/PROGRESSIVE_ENHANCEMENT.md] - CSS-first approach for UI
- [@~/.claude/rules/development/READABLE_CODE.md] - Code readability and clarity
- [@~/.claude/rules/development/CONTAINER_PRESENTATIONAL.md] - React component patterns

### Principle Hierarchy

**TDD/RGRC is the primary implementation cycle**. Within this cycle:

- **Red & Green phases**: Focus on functionality only
- **Refactor phase**: Apply SOLID and DRY principles
- **Commit phase**: Save stable state

This ensures that code first works (TDD), then becomes clean and maintainable (SOLID/DRY).

### 1. Test-Driven Development (TDD) as t_wada would

**Goal**: "Clean code that works" (動作するきれいなコード) - Ron Jeffries

#### Enhanced RGRC Cycle with Real-time Feedback

1. **Red Phase** (Confidence Target: 0.9)
   ```bash
   npm test -- --testNamePattern="[current test]" | grep -E "FAIL|PASS"
   ```
   - Write failing test with clear intent
   - Verify failure reason matches expectation
   - Document understanding via test assertions
   - **Exit Criteria**: Test fails for expected reason

2. **Green Phase** (Confidence Target: 0.7)
   ```bash
   npm test -- --watch --testNamePattern="[current test]"
   ```
   - Minimal implementation to pass
   - Quick solutions acceptable
   - Focus on functionality over form
   - **Exit Criteria**: Test passes consistently

3. **Refactor Phase** (Confidence Target: 0.95)
   ```bash
   npm test | tail -5 | grep -E "Passing|Failing"
   ```
   - Apply SOLID principles
   - Remove duplication (DRY)
   - Improve naming and structure
   - Extract abstractions
   - **Exit Criteria**: All tests green, code clean

4. **Commit Phase** (Confidence Target: 1.0)
   - Quality checks pass
   - Coverage maintained/improved
   - Ready for stable commit
   - User executes git commands

#### Advanced TodoWrite Integration

Real-time tracking with confidence scoring:

```markdown
# Implementation: [Feature Name]
## Scenarios (Total Confidence: 0.85)
1. ⏳ User registration with valid email [C: 0.9]
2. ⏳ Registration fails with invalid email [C: 0.8]
3. ⏳ Duplicate email prevention [C: 0.85]

## Current RGRC Cycle - Scenario 1
### Red Phase (Started: 14:23)
1.1 ✅ Write failing test [C: 0.95] ✓ 2 min
1.2 ✅ Verify correct failure [C: 0.9] ✓ 30 sec

### Green Phase (Active: 14:26) 
1.3 ❌ Implement registration logic [C: 0.7] ⏱️ 3 min
1.4 ⏳ Test passes consistently [C: pending]

### Refactor Phase (Pending)
1.5 ⏳ Apply SOLID principles [C: pending]
1.6 ⏳ Extract validation logic [C: pending]

### Quality Gates
- 🧪 Tests: 12/14 passing
- 📊 Coverage: 78% (target: 80%)
- 🔍 Lint: 2 warnings
- 🔷 Types: All passing
```

### 2. SOLID Principles During Implementation

Apply during Refactor phase:

- **SRP**: Each class/function has one reason to change
- **OCP**: Extend functionality without modifying existing code
- **LSP**: Derived classes must be substitutable for base classes
- **ISP**: Clients shouldn't depend on unused interfaces
- **DIP**: Depend on abstractions, not concrete implementations

### 3. DRY (Don't Repeat Yourself) Principle

**"Every piece of knowledge must have a single, unambiguous, authoritative representation"**

- Extract repeated logic into functions
- Create configuration objects for repeated values
- Use composition for repeated structure
- Avoid copy-paste programming

### 4. Consistency with Existing Code

- Follow coding conventions
- Utilize existing patterns and libraries
- Maintain naming convention consistency

## Hierarchical Implementation Process

### Phase 1: Context Discovery & Planning
Analyze with confidence scoring:
1. **Code Context**: Understand existing patterns (C: 0.0-1.0)
2. **Dependencies**: Verify required libraries available
3. **Conventions**: Detect and follow project standards
4. **Test Structure**: Identify test patterns to follow

### Phase 2: Parallel Quality Execution
Run quality checks simultaneously:
```typescript
// Execute these in parallel, not sequentially
const qualityChecks = [
  Bash({ command: "npm run lint" }),
  Bash({ command: "npm run type-check" }),
  Bash({ command: "npm test -- --findRelatedTests" }),
  Bash({ command: "npm run format:check" })
];
```

### Phase 3: Confidence-Based Decisions
Make implementation choices based on evidence:
- **High Confidence (>0.8)**: Proceed with implementation
- **Medium (0.5-0.8)**: Add defensive checks
- **Low (<0.5)**: Research before implementing

### 2. Code Implementation with TDD

Follow the RGRC cycle defined above:

- **Red**: Write failing test first
- **Green**: Minimal code to pass
- **Refactor**: Apply SOLID and DRY principles
- **Commit**: Save stable state

### 3. Dynamic Quality Checks

#### Automatic Discovery
```bash
cat package.json | jq -r '.scripts | to_entries[] | select(.key | test("lint|type|check|test|format")) | .key' | head -10
```

#### Parallel Execution
```markdown
## Quality Check Results
### Linting (Confidence: 0.95)
```bash
npm run lint | tail -5
```
- Status: ✅ Passing
- Issues: 0 errors, 2 warnings
- Time: 1.2s

### Type Checking (Confidence: 0.98)
```bash
npm run type-check | tail -5
```
- Status: ✅ All types valid
- Files checked: 47
- Time: 3.4s

### Tests (Confidence: 0.92)
```bash
npm test -- --passWithNoTests | grep -E "Tests:|Snapshots:"
```
- Status: ✅ 45/45 passing
- Coverage: 82%
- Time: 8.7s

### Format Check (Confidence: 0.90)
```bash
npm run format:check | tail -3
```
- Status: ⚠️ 3 files need formatting
- Auto-fixable: Yes
- Time: 0.8s
```

#### Quality Score Calculation
```
Overall Quality Score: (L*0.3 + T*0.3 + Test*0.3 + F*0.1) = 0.93
Confidence Level: HIGH - Ready for commit
```

### 4. Functionality Verification

- Verify on development server
- Validate edge cases
- Check performance

## Advanced Features

### Real-time Test Monitoring
Watch test results during development:
```bash
npm test -- --watch --coverage
```

### Code Complexity Analysis
Track complexity during implementation:
```bash
npx complexity-report src/ | grep -E "Complexity|Maintainability"
```

### Performance Profiling
For performance-critical code:
```bash
npm run profile
```

### Security Scanning
Automatic vulnerability detection:
```bash
npm audit --production | grep -E "found|Severity"
```

## Implementation Patterns

### Pattern Selection by Confidence
```markdown
## Available Patterns (Choose based on context)

### High Confidence Patterns (>0.9)
1. **Factory Pattern** - Object creation
   - When: Multiple similar objects
   - Confidence: 0.95
   - Example in: src/factories/

2. **Repository Pattern** - Data access
   - When: Database operations
   - Confidence: 0.92
   - Example in: src/repositories/

### Medium Confidence Patterns (0.7-0.9)
1. **Observer Pattern** - Event handling
   - When: Loose coupling needed
   - Confidence: 0.85
   - Consider: Built-in EventEmitter

### Experimental Patterns (<0.7)
1. **New architectural pattern**
   - Confidence: 0.6
   - Recommendation: Prototype first
```

## Risk Mitigation

### Common Implementation Risks
| Risk | Probability | Impact | Mitigation | Confidence |
|------|------------|--------|------------|------------|
| Breaking existing tests | Medium | High | Run full suite before/after | 0.95 |
| Performance regression | Low | High | Profile critical paths | 0.88 |
| Security vulnerability | Low | Critical | Security scan + review | 0.92 |
| Inconsistent patterns | Medium | Medium | Follow existing examples | 0.90 |
| Missing edge cases | High | Medium | Comprehensive test cases | 0.85 |

## Definition of Done with Confidence Metrics

Implementation complete when all metrics achieved:

```markdown
## Completion Checklist
### Core Implementation
- ✅ All RGRC cycles complete [C: 0.95]
- ✅ Feature works as specified [C: 0.93]
- ✅ Edge cases handled [C: 0.88]

### Quality Metrics
- ✅ All tests passing (47/47) [C: 1.0]
- ✅ Coverage ≥ 80% (current: 82%) [C: 0.95]
- ✅ Zero lint errors [C: 0.98]
- ✅ Zero type errors [C: 1.0]
- ⚠️ 2 lint warnings (documented) [C: 0.85]

### Code Quality
- ✅ SOLID principles applied [C: 0.90]
- ✅ DRY - No duplication [C: 0.92]
- ✅ Readable code standards [C: 0.88]
- ✅ Consistent with codebase [C: 0.94]

### Documentation
- ✅ Code comments where needed [C: 0.85]
- ✅ README updated if required [C: 0.90]
- ✅ API docs current [C: 0.87]

### Overall Confidence: 0.92 (HIGH)
Status: ✅ READY FOR REVIEW
```

If confidence < 0.8 on any critical metric, continue improving.

## Decision Framework

### When Implementation Confidence is Low
```markdown
## Low Confidence Detected (< 0.7)
### Issue: [Uncertain about implementation approach]

Options:
1. **Research More** (/research)
   - Time: +30 min
   - Confidence gain: +0.3
   
2. **Prototype First**
   - Time: +15 min  
   - Confidence gain: +0.2
   
3. **Consult Documentation**
   - Time: +10 min
   - Confidence gain: +0.15

Recommendation: Option 1 for complex features
```

### Quality Gate Failures
```markdown
## Quality Gate Failed
### Issue: Coverage dropped below 80%

Current: 78% (-2% from main)
Uncovered lines: src/auth/validator.ts:45-52

Actions:
1. ❌ Add tests for uncovered lines
2. ⏳ Or document why not testable
3. ⏳ Or adjust threshold (not recommended)

Proceeding without resolution? (y/N)
```

## Usage Examples

### Basic Implementation
```bash
/code "Add user authentication"
# Standard TDD implementation
```

### With Confidence Threshold
```bash
/code --confidence 0.9 "Critical payment logic"
# Requires 90% confidence before proceeding
```

### Fast Mode (Skip Some Checks)
```bash
/code --fast "Simple UI update"
# Minimal quality checks for low-risk changes
```

### With Specific Pattern
```bash
/code --pattern repository "Database access layer"
# Use repository pattern for implementation
```

## Next Steps

- **High Confidence (>0.9)** → Ready for `/test` or review
- **Medium (0.7-0.9)** → Consider additional testing
- **Low (<0.7)** → Need `/research` or planning
- **Quality Issues** → Fix before proceeding
- **All Green** → Ready for PR/commit
