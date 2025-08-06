---
name: hotfix
description: 本番環境の緊急対応が必要な重大な問題を修正
priority: high
suitable_for:
  scale: [small, medium]
  type: [fix]
  understanding: "≥ 70%"
  urgency: [high]  # Only for urgent issues
  environment: production
  severity: [critical, security]
aliases: [emergency-fix, prod-fix]
timeout: 60
context:
  files_changed: "< 10"
  lines_changed: "< 200"
  new_features: false
  breaking_changes: true  # May need breaking changes for security
excludes: [fix]  # Don't suggest both
---

# /hotfix - Emergency Hot Fix

## Purpose

Apply critical fixes to production issues with minimal process overhead while maintaining quality.

## Usage

For urgent production bugs requiring immediate attention.

## Workflow

Streamlined critical path: Quick analysis → Fix → Test → Deploy readiness

## Safety Checks

**MANDATORY**: Before proceeding with hotfix:

1. **Impact Assessment**: Is production truly affected?
2. **Rollback Ready**: Note current version/commit
3. **Minimum Fix**: Scope the smallest possible change
4. **Team Alert**: Notify stakeholders
5. **Test Plan**: Define critical path testing

⚠️ **WARNING**: Production changes carry high risk. Double-check everything.

## Execution Steps

### 1. Triage (5 min)

- Confirm production impact
- Identify root cause
- Define minimum fix

### 2. Fix (15 min)

- Apply focused change
- Stability > Elegance
- Document technical debt

### 3. Test (10 min)

- Verify issue resolved
- Check critical paths only
- No comprehensive testing

### 4. Deploy Ready

- Clear commit message
- Rollback documented
- Team notified

## TodoWrite Integration

Emergency tracking (keep it simple):

```md
# HOTFIX: [Critical issue]
1. ⏳ Triage & Assess
2. ⏳ Emergency Fix
3. ⏳ Critical Testing
```

## Output Format

```markdown
## 🚨 HOTFIX Summary
- Critical Issue: [Description]
- Severity: [Critical/High]
- Root Cause: [Brief explanation]

## Changes Made
- Files Modified: [List with specific changes]
- Risk Assessment: [Low/Medium/High]
- Rollback Plan: [How to revert if needed]

## Verification
- Issue Resolved: [Yes/No]
- Tests Passed: [List of tests]
- Side Effects: [None/Listed]

## Follow-up Required
- Technical Debt: [What needs cleanup]
- Full Testing: [What needs comprehensive testing]
- Documentation: [What needs updating]
```

## When to Use

- Production is down
- Security vulnerabilities
- Data corruption risks
- Critical user-facing bugs
- Regulatory compliance issues

## When NOT to Use

- Feature requests
- Performance improvements
- Refactoring
- Non-critical bugs

## Key Principles

- Fix first, perfect later
- Document everything
- Test the critical path
- Plan for rollback
- Schedule follow-up

## Example Usage

```md
/hotfix "Payment processing returning 500 errors"
/hotfix "User data exposed in API response"
/hotfix "Login completely broken after deployment"
```

## Post-Hotfix Actions

1. **Immediate**: Deploy and monitor
2. **Within 24h**: Run `/reflect` to document lessons
3. **Within 1 week**: Use full workflow to properly fix
4. **Update**: Add test cases to prevent recurrence

## Command Differentiation Guide

### Use `/hotfix` when

- 🚨 Production environment is affected
- System is down or severely impaired
- Security vulnerability discovered
- Data integrity at risk
- Regulatory compliance issue
- Users cannot complete critical actions

### Use `/fix` instead when

- 🔧 Working in development environment
- Issue is minor or cosmetic
- No immediate user impact
- Can wait for normal deployment cycle
- Testing can follow standard process

### Key Difference

- **hotfix**: Emergency production fixes with immediate deployment need
- **fix**: Rapid development fixes following normal deployment flow
