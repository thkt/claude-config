---
name: review
description: 複数の専門エージェントによるコードレビューを実行
priority: medium
suitable_for:
  scale: [small, medium, large]
  type: [review, analysis]
  understanding: "≥ 50%"
  urgency: [low, medium]
aliases: [code-review, cr]
timeout: 90
context:
  files_changed: "none"
  lines_changed: "0"
  new_features: false
  breaking_changes: false
---

# /review - Code Review Orchestrator

## Purpose
Orchestrate multiple specialized review agents to provide comprehensive code analysis.

## Usage
Simply describe what you want reviewed:
- "Review the authentication code"
- "Check accessibility in components"
- "Security review for API endpoints"
- "Full review of recent changes"

## Execution Strategy

### 1. Scope Analysis
- Determine what needs review (files/directories)
- Identify code type (frontend/backend/infrastructure)
- Assess review depth needed

### 2. Agent Selection
Automatically select relevant agents based on scope:
- **Frontend**: accessibility, design-pattern, performance reviewers
- **Security**: security-reviewer for all code types
- **Quality**: readability, structure, type-safety reviewers
- **Architecture**: root-cause, testability reviewers

### 3. TodoWrite Integration
Track review progress:
```
# Review: [target description]
1. ⏳ Scope analysis
2. ⏳ Execute review agents
3. ⏳ Consolidate findings
4. ⏳ Generate recommendations
```

### 4. Orchestration via Task Agent
Use `review-orchestrator` agent to:
- Coordinate multiple review agents in parallel
- Prioritize critical issues
- Consolidate results into actionable report
- Generate fix suggestions when applicable

## Review Levels

### Quick (2-3 min)
- Critical issues only
- Security vulnerabilities
- Breaking changes

### Standard (5-7 min)
- All critical + high priority issues
- Performance problems
- Accessibility violations
- Type safety concerns

### Comprehensive (10+ min)
- Full analysis across all dimensions
- Root cause analysis
- Refactoring suggestions
- Technical debt assessment

## Available Review Agents

### Core Reviewers
- `review-orchestrator` - Coordinates all review activities
- `frontend-structure-reviewer` - Code organization and patterns
- `frontend-root-cause-reviewer` - Deep problem analysis

### Quality Reviewers
- `frontend-readability-reviewer` - Code clarity and maintainability
- `type-safety-reviewer` - TypeScript and type coverage
- `testability-reviewer` - Test design and coverage

### Specialized Reviewers
- `security-reviewer` - Security vulnerabilities
- `accessibility-reviewer` - WCAG compliance and a11y
- `performance-reviewer` - Performance bottlenecks
- `design-pattern-reviewer` - Architecture and patterns
- `progressive-enhancer` - Progressive enhancement approach

## Output Format

```markdown
## Review Summary
- Scope: [Files/directories reviewed]
- Issues Found: [Count by severity]
- Immediate Actions: [Critical items]

## Critical Issues 🚨
[Issues requiring immediate attention]

## High Priority ⚠️
[Important improvements needed]

## Recommendations 💡
[Suggested improvements and best practices]

## Next Steps
[Prioritized action items]
```

## When to Use
- Before creating pull requests
- After significant refactoring
- When inheriting unfamiliar code
- Regular quality checks
- Security audit requirements

## When NOT to Use
- Single file quick fixes (use `/fix`)
- During active development (too disruptive)
- Emergency hotfixes (use `/hotfix`)

## Example Usage
```
/review "Check the new authentication implementation"
/review "Security review for payment processing"
/review "Accessibility audit for checkout flow"
/review "Full review before v2.0 release"
```

## Tips for Effective Reviews
1. **Be specific** about what needs review
2. **Review early** in development cycle
3. **Focus on one area** at a time when possible
4. **Act on critical issues** immediately
5. **Track improvements** over time

## Next Steps
- Critical issues → `/fix` or `/hotfix`
- Refactoring needs → `/think` then `/code`
- Performance issues → targeted optimization
- Test coverage → `/test` with specific focus
