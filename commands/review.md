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
allowed-tools: Bash(git diff:*), Bash(git status:*), Bash(git log:*), Bash(git show:*), Read, Glob, Grep, LS, Task
context:
  files_changed: "dynamic"
  lines_changed: "dynamic"
  new_features: "detected"
  breaking_changes: "detected"
---

# /review - Advanced Code Review Orchestrator

## Purpose

Orchestrate multiple specialized review agents with dynamic context analysis, hierarchical task decomposition, and confidence-based filtering.

## Dynamic Context Analysis

### Git Status
Check git status:
```bash
git status --porcelain
```

### Files Changed
List changed files:
```bash
git diff --name-only HEAD
```

### Recent Commits
View recent commits:
```bash
git log --oneline -10
```

### Change Statistics
Show change statistics:
```bash
git diff --stat HEAD
```

## Hierarchical Review Process

### Phase 1: Context Discovery
Use Task agent to:
1. Analyze repository structure and technology stack
2. Identify review scope (changed files, directories)
3. Detect code patterns and existing quality standards
4. Determine applicable review categories

### Phase 2: Parallel Specialized Reviews
Launch multiple review agents concurrently:
- Each agent focuses on specific aspect
- Independent execution for efficiency
- Collect raw findings with confidence scores

### Phase 3: Filtering and Consolidation
Apply multi-level filtering:
1. **Confidence Filter**: Only issues with >0.7 confidence
2. **False Positive Filter**: Apply exclusion rules
3. **Deduplication**: Merge similar findings
4. **Prioritization**: Sort by impact and severity

## Review Agents and Their Focus

### Core Architecture Reviewers
- `review-orchestrator`: Coordinates all review activities
- `structure-reviewer`: Code organization, DRY violations, coupling
- `root-cause-reviewer`: Deep problem analysis, architectural debt

### Quality Assurance Reviewers
- `readability-reviewer`: Code clarity, naming, complexity
- `type-safety-reviewer`: TypeScript coverage, any usage, type assertions
- `testability-reviewer`: Test design, mocking, coverage gaps

### Specialized Domain Reviewers
- `security-reviewer`: Vulnerabilities, auth issues, data exposure
- `accessibility-reviewer`: WCAG compliance, keyboard navigation, ARIA
- `performance-reviewer`: Bottlenecks, bundle size, rendering issues
- `design-pattern-reviewer`: Pattern consistency, React best practices
- `progressive-enhancer`: CSS-first solutions, graceful degradation
- `document-reviewer`: README quality, API docs, inline comments

## Exclusion Rules

### Automatic Exclusions (False Positive Prevention)
1. **Style Issues**: Formatting, indentation (handled by linters)
2. **Minor Naming**: Unless severely misleading
3. **Test Files**: Focus on production code unless requested
4. **Generated Code**: Build outputs, vendor files
5. **Documentation**: Unless specifically reviewing docs
6. **Theoretical Issues**: Without concrete exploitation path
7. **Performance Micro-optimizations**: Unless measurable impact
8. **Missing Features**: vs actual bugs/issues

### Context-Aware Exclusions
- Framework-specific patterns (React/Angular/Vue idioms)
- Project conventions (detected from existing code)
- Language-specific safety (memory-safe languages)
- Environment assumptions (browser vs Node.js)

## Output Format with Confidence Scoring

```markdown
## Review Summary
- Files Reviewed: [Count and list]
- Total Issues: [Count by severity]
- Review Coverage: [Percentage]
- Confidence Level: [Average confidence]

## Critical Issues 🚨 (Confidence > 0.9)
### Issue #1: [Title]
- **File**: path/to/file.ts:42
- **Category**: security|performance|accessibility|etc
- **Confidence**: 0.95
- **Description**: [Detailed explanation]
- **Impact**: [User/system impact]
- **Recommendation**: [Specific fix with code example]

## High Priority ⚠️ (Confidence > 0.8)
[Similar format...]

## Medium Priority 💡 (Confidence > 0.7)
[Similar format...]

## Improvement Opportunities
[Lower confidence suggestions for consideration]

## Metrics
- Code Quality Score: [A-F rating]
- Technical Debt Estimate: [Hours]
- Test Coverage Gap: [Percentage]
- Security Posture: [Rating]

## Recommended Actions
1. **Immediate**: [Critical fixes]
2. **Next Sprint**: [High priority items]
3. **Backlog**: [Nice-to-have improvements]
```

## Review Strategies

### Quick Review (2-3 min)
Focus areas:
- Security vulnerabilities
- Critical bugs
- Breaking changes
- Accessibility violations

Command: `/review --quick`

### Standard Review (5-7 min)
Includes Quick + :
- Performance issues
- Type safety problems
- Test coverage gaps
- Code organization

Command: `/review` (default)

### Deep Review (10+ min)
Comprehensive analysis:
- All standard checks
- Root cause analysis
- Technical debt assessment
- Refactoring opportunities
- Architecture evaluation

Command: `/review --deep`

### Focused Review
Target specific areas:
- `/review --security` - Security focus
- `/review --performance` - Performance focus
- `/review --accessibility` - A11y focus
- `/review --architecture` - Design patterns

## TodoWrite Integration

Automatic task creation:
```markdown
# Code Review: [Target]
1. ⏳ Context discovery and scope analysis
2. ⏳ Execute specialized review agents (parallel)
3. ⏳ Filter and validate findings (confidence > 0.7)
4. ⏳ Consolidate and prioritize results
5. ⏳ Generate actionable recommendations
```

## Custom Review Instructions

Support for project-specific rules:
- `.claude/review-rules.md` - Project conventions
- `.claude/exclusions.md` - Custom exclusions
- `.claude/review-focus.md` - Priority areas

## Advanced Features

### Incremental Reviews
Compare against baseline:
```bash
git diff origin/main...HEAD --name-only
```

### Pattern Detection
Identify recurring issues:
- Similar problems across files
- Systemic architectural issues
- Common anti-patterns

### Learning Mode
Track and improve:
- False positive patterns
- Project-specific idioms
- Team preferences

## Usage Examples

### Basic Review
```bash
/review
# Reviews all changed files with standard depth
```

### Targeted Review
```bash
/review "authentication module"
# Focuses on auth-related code
```

### Security Audit
```bash
/review --security --deep
# Comprehensive security analysis
```

### Pre-PR Review
```bash
/review --compare main
# Reviews changes against main branch
```

### Component Review
```bash
/review "src/components" --accessibility
# A11y review of components directory
```

## Best Practices

1. **Review Early**: Catch issues before they compound
2. **Review Incrementally**: Small, frequent reviews > large, rare ones
3. **Act on High Confidence**: Focus on >0.8 confidence issues
4. **Track Patterns**: Identify recurring problems
5. **Customize Rules**: Add project-specific exclusions
6. **Iterate on Feedback**: Tune confidence thresholds

## Integration Points

### Pre-commit Hook
```bash
claude review --quick || exit 1
```

### CI/CD Pipeline
```yaml
- name: Code Review
  run: claude review --security --performance
```

### PR Comments
Results formatted for GitHub/GitLab comments

## Next Steps After Review

- **Critical Issues** → `/hotfix` for production issues
- **Bugs** → `/fix` for development fixes
- **Refactoring** → `/think` → `/code` for improvements
- **Performance** → Targeted optimization with metrics
- **Tests** → `/test` with coverage goals
- **Documentation** → Update based on findings
