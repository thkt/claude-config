---
name: fix
description: 開発環境で小さなバグの修正や軽微な改善を素早く実行
priority: high
suitable_for:
  scale: [small]
  type: [fix, refactor]
  understanding: "≥ 80%"
  urgency: [low, medium]  # Not for emergencies
  environment: development  # Development environment only
aliases: [qf]
timeout: 30
allowed-tools: Bash(git diff:*), Bash(npm test:*), Bash(npm run:*), Edit, MultiEdit, Read, Grep, TodoWrite
context:
  files_changed: "dynamic"
  lines_changed: "tracked"
  test_status: "monitored"
  quality_checks: "parallel"
  confidence_level: "scored"
excludes: [hotfix]  # Don't suggest both
---

# /fix - Advanced Quick Fix with Dynamic Analysis

## Purpose

Rapidly fix small bugs with dynamic problem detection, confidence scoring, and parallel quality verification.

## Usage

For simple fixes that don't require extensive planning or research.

## Dynamic Problem Context

### Recent Changes Analysis

```bash
!`git diff HEAD~1 --stat 2>/dev/null | head -5 || echo "No recent changes"`
```

### Test Status Check

```bash
!`npm test -- --listTests 2>/dev/null | grep -E "(test|spec)" | wc -l | xargs -I {} echo "Available test files: {}" || echo "No tests found"`
```

### Quality Commands Discovery

```bash
!`npm run 2>&1 | grep -E "lint|type|check|test" | head -5 || echo "No quality scripts"`
```

### Related Files Detection

```bash
!`git ls-files --modified 2>/dev/null | head -5 || echo "No modified files"`
```

## Hierarchical Fix Process

### Phase 1: Problem Analysis (Confidence Target: 0.85)

Dynamic root cause identification:

1. **Issue Detection**: Analyze symptoms and error patterns
2. **Impact Scope**: Determine affected files and components
3. **Root Cause**: Identify why not just what
4. **Fix Strategy**: Choose simplest effective approach

### Phase 2: Targeted Implementation (Confidence Target: 0.90)

Apply fix with confidence scoring:

- **High Confidence (>0.9)**: Direct fix implementation
- **Medium (0.7-0.9)**: Add defensive checks
- **Low (<0.7)**: Research before fixing

### Phase 3: Parallel Verification (Confidence Target: 0.95)

Simultaneous quality checks:

```typescript
// Execute in parallel, not sequentially
const checks = [
  Bash({ command: "npm test -- --findRelatedTests" }),
  Bash({ command: "npm run lint -- --fix" }),
  Bash({ command: "npm run type-check" })
];
```

## Enhanced Execution with Confidence Metrics

### 1. Dynamic Problem Analysis

#### Issue Classification

```markdown
## Problem Analysis (Confidence: X.XX)
### Category: [UI/Logic/Performance/Type/Test]
- **Symptoms**: [Observable behavior]
- **Evidence**: [Error messages, test failures]
- **Root Cause**: [Why it's happening]
- **Confidence**: [0.0-1.0 score]
```

#### Recent Context

```bash
git log --oneline -5 --grep="fix"
```

### 2. Smart Implementation

#### Fix Approach Selection

```markdown
## Fix Strategy (Confidence: X.XX)
### Selected Approach: [Name]
- **Implementation**: [How to fix]
- **Rationale**: [Why this approach]
- **Risk Level**: [Low/Medium/High]
- **Alternative**: [If confidence < 0.8]
```

#### Progressive Enhancement Check

```markdown
## CSS-First Analysis
- Can CSS solve this? [Yes/No]
- If Yes: [CSS solution]
- If No: [Why JS is needed]
```

### 3. Real-time Verification

#### Parallel Quality Execution

Run quality checks in parallel:

```bash
npm test -- --findRelatedTests | grep -E "PASS|FAIL" | head -5
npm run lint | tail -3
npm run type-check | tail -3
```

#### Regression Check

```bash
npm test -- --onlyChanged | grep -E "Test Suites:"
```

## Advanced TodoWrite Integration

Real-time tracking with confidence scoring:

```markdown
# Fix: [Issue Description]
## Analysis Phase (Confidence: X.XX)
1. ✅ Problem identified [C: 0.95] ✓ 2 min
2. ❌ Root cause analysis [C: 0.85] ⏱️ Active
3. ⏳ Fix strategy selection [C: pending]

## Implementation Phase
4. ⏳ Apply targeted fix [C: pending]
5. ⏳ Update related tests [C: pending]

## Verification Phase
6. ⏳ Run quality checks (parallel) [C: pending]
7. ⏳ Confirm fix resolves issue [C: pending]

## Metrics
- 🎯 Problem Clarity: 85%
- 🔧 Fix Confidence: 90%
- ✅ Tests Passing: 12/12
- 📊 Coverage Impact: +2%
```

## Definition of Done with Confidence Scoring

```markdown
## Fix Completion Checklist
### Problem Resolution
- ✅ Root cause identified [C: 0.92]
- ✅ Fix addresses cause not symptom [C: 0.88]
- ✅ Minimal complexity solution [C: 0.95]

### Quality Metrics
- ✅ All related tests pass [C: 1.0]
- ✅ No new lint errors [C: 0.98]
- ✅ Type safety maintained [C: 1.0]
- ✅ No regressions detected [C: 0.93]

### Code Standards
- ✅ Follows existing patterns [C: 0.90]
- ✅ Progressive Enhancement applied [C: 0.87]
- ✅ Documentation updated if needed [C: 0.85]

### Overall Confidence: 0.91 (HIGH)
Status: ✅ FIX COMPLETE
```

If any metric has confidence < 0.8, continue improving.

## Enhanced Output Format

```markdown
## 🔧 Fix Summary
### Problem
- **Issue**: [Description]
- **Category**: [UI/Logic/Performance/Type]
- **Root Cause**: [Why it happened]
- **Confidence**: 0.XX

### Solution Applied
- **Approach**: [Fix strategy used]
- **Files Modified**:
  - `path/to/file.ts` - [What changed]
  - `path/to/test.ts` - [Test updates]
- **Progressive Enhancement**: [CSS-first approach used?]

### Verification Results
- **Tests**: ✅ 15/15 passing
- **Lint**: ✅ No issues
- **Types**: ✅ All valid
- **Coverage**: 82% (+2%)
- **Regression**: None detected

### Confidence Metrics
| Stage | Confidence | Result |
|-------|------------|--------|
| Analysis | 0.88 | Root cause found |
| Implementation | 0.92 | Clean fix applied |
| Verification | 0.95 | All checks pass |
| **Overall** | **0.91** | **HIGH CONFIDENCE** |

### Performance Impact

    ```bash
    git diff HEAD --stat | tail -3
    ```

- Lines changed: XX
- Files affected: X
- Complexity: Low
```

## Decision Framework

### When to Use `/fix` (Confidence Check)

```markdown
✅ High Confidence Scenarios (>0.85)
- Single-file fixes with clear scope
- Test failures with obvious causes
- Typo and naming corrections
- CSS-solvable UI issues
- Simple logic errors
- Configuration updates

⚠️ Medium Confidence (0.6-0.85)
- Two-file coordinated changes
- Missing error handling
- Performance optimizations
- State management fixes

❌ Low Confidence (<0.6) - Use different command
- Multi-file refactoring → /code
- Unknown root cause → /research
- New features → /think → /code
- Production issues → /hotfix
```

### Automatic Command Switching

If confidence drops below 0.6 during analysis:

```markdown
## Low Confidence Detected
### Issue: Fix scope exceeds /fix capabilities

Recommended action:
- For investigation: /research
- For planning: /think
- For implementation: /code

Switch command? (Y/n)
```

## Example Usage with Confidence

### High Confidence Fix

```markdown
/fix "Fix button alignment issue in header"
# Confidence: 0.92 - CSS-first solution available
```

### Medium Confidence Fix

```markdown
/fix "Resolve state update not triggering re-render"
# Confidence: 0.75 - May need investigation
```

### Auto-escalation Example

```markdown
/fix "Optimize database query performance"
# Confidence: 0.45 - Suggests /research → /think instead
```

## Next Steps Based on Outcome

### Success Path (Confidence >0.9)

- Document learnings
- Add regression test
- Update related documentation

### Partial Success (Confidence 0.7-0.9)

- Review with `/research` for completeness
- Consider follow-up `/fix` for remaining issues

### Escalation Path (Confidence <0.7)

```markdown
## Recommended Workflow
Based on analysis, suggesting:
1. /research - Investigate deeper
2. /think - Plan comprehensive solution
3. /code - Implement with full TDD
```

## Advanced Features

### Pattern Learning

Track successful fixes for similar issues:

```bash
git log --grep="fix" --oneline | grep -i "[similar keyword]" | head -3
```

### Auto-discovery

Find related issues that might need fixing:

```bash
grep -r "TODO\|FIXME\|HACK" --include="*.ts" --include="*.tsx" | head -5
```

### Quality Trend

Monitor fix impact on codebase health:

```bash
npm run lint | grep -E "problems\|warnings"
```

## Applied Principles

This command applies Progressive Enhancement from [@~/.claude/rules/development/PROGRESSIVE_ENHANCEMENT.md]:

- CSS-first approach for UI issues
- Root cause analysis
- Minimal complexity solutions

## Command Differentiation Guide

### Use `/fix` when

- 🔧 Working in development environment
- Issue is small and well-understood
- Fix can be tested normally
- No production emergency
- Standard deployment timeline is acceptable

### Use `/hotfix` instead when

- 🚨 Production is down or impaired
- Security vulnerability in production
- Users are actively affected
- Immediate deployment required
- Emergency response needed

### Key Difference

- **fix**: Rapid development fixes with normal testing/deployment
- **hotfix**: Emergency production fixes requiring immediate action
