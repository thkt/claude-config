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
context:
  files_changed: "< 3"
  lines_changed: "< 50"
  new_features: false
  breaking_changes: false
excludes: [hotfix]  # Don't suggest both
---

# /fix - Fix Small Issues

## Purpose

Rapidly fix small bugs or make minor improvements without full workflow overhead.

## Usage

For simple fixes that don't require extensive planning or research.

## Workflow

Streamlined combination of:

1. **Mini-think**: Quick root cause analysis
2. **Mini-code**: Targeted implementation
3. **Mini-test**: Focused verification

## Execution Steps

### 1. Quick Analysis

Apply Progressive Enhancement from [@~/.claude/rules/development/PROGRESSIVE_ENHANCEMENT.md]:

- Identify the specific issue and root cause
- Check if CSS can solve it before using JS
- Locate affected files
- Determine minimal fix approach

### 2. Implementation

Follow Progressive Enhancement approach:

- Apply targeted fix using simplest solution (CSS-first for UI)
- Follow existing code patterns
- Add/update tests if needed

### 3. Verification

- Run relevant tests if available
- Verify fix resolves issue
- Check for regressions

## TodoWrite Integration

Track fix progress with TodoWrite:

```md
# Fix: [Issue description]
1. ⏳ Analysis: Identify root cause and approach
2. ⏳ Implementation: Apply fix
3. ⏳ Verification: Test and confirm fix
```

Update task status as you progress through each phase.

## Definition of Done

Fix is complete when:

- Root cause identified and addressed
- Fix applied with minimal complexity
- Tests pass (if applicable)
- Quality checks clean (if project has them)
- No regressions introduced

## Output Format

```markdown
## Fix Summary
- Issue: [Brief description]
- Files Modified: [List of files]
- Tests Updated: [Yes/No]
- Verification: [Passed/Failed]
```

## When to Use

- Single-file fixes
- Typo corrections
- Simple logic errors
- Small UI adjustments (CSS-first approach)
- Layout issues (Grid/Flexbox solutions)
- Responsive design fixes
- Configuration updates

## When NOT to Use

- Multi-file refactoring
- New feature implementation
- Complex architectural changes
- Issues requiring research

## Example Usage

```md
/fix "Fix button alignment issue in header"
/fix "Correct typo in error message"
/fix "Update API endpoint URL"
```

## Next Steps

- If successful: Consider `/reflect` for learnings
- If complex: Switch to full workflow starting with `/think`

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
