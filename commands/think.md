---
name: think
description: 詳細な分析を行い、包括的な実装計画を作成
priority: high
suitable_for:
  scale: [small, medium, large]
  type: [fix, feature, refactor, optimize]
  understanding: "≥ 50%"
  urgency: [low, medium]
aliases: [plan, analyze]
timeout: 60
allowed-tools: Bash(git log:*), Bash(git diff:*), Bash(find:*), Bash(cat package.json:*), Read, Glob, Grep, LS, Task
context:
  complexity: "assessed"
  risks: "evaluated"
  dependencies: "mapped"
  solutions: "scored"
---

# /think - Advanced Planning & Solution Architecture

## Purpose

Perform detailed problem analysis with dynamic project understanding, risk assessment, and confidence-scored solution planning (SOW).

## Dynamic Project Context

### Current Branch & Changes

Check current git branch:

```bash
git branch --show-current
```

### Recent Related Commits

Find related commits by topic:

```bash
git log --oneline -10 --grep="[topic]"
```

### Project Complexity Metrics

Count source files:

```bash
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) -not -path "*/node_modules/*" | wc -l
```

### Dependencies That May Impact

List key dependencies:

```bash
cat package.json | jq -r '.dependencies | to_entries | map(select(.key | test("react|redux|router|state|auth|api"))) | .[].key' | head -5
```

### Test Coverage Status

Check test coverage:

```bash
cat coverage/coverage-summary.json | jq -r '.total.lines.pct'
```

## Hierarchical Analysis Process

### Phase 1: Problem Understanding

Deep analysis with confidence scoring:

1. **Problem Definition**: Clear statement with evidence
2. **Impact Analysis**: Affected systems and users
3. **Root Cause**: Why the problem exists (not just symptoms)
4. **Constraints**: Technical, time, resource limitations

### Phase 2: Solution Discovery

Generate and evaluate multiple approaches:

1. **Solution Generation**: 3+ alternative approaches
2. **Principle Evaluation**: SOLID, DRY, Progressive Enhancement
3. **Risk Assessment**: Technical, schedule, maintenance risks
4. **Confidence Scoring**: Rate each solution (0.0-1.0)

## Decision Process Trace

Record decision-making stages with transparency and confidence levels:

### Stage 1: Problem Identification (Confidence: X.XX)

```markdown
- **Input Signal**: [Original user request or error description]
- **Problem Category**: [UI/State/Performance/Security/Logic]
- **Pattern Match**: [Similar to existing issue type or new]
- **Evidence**: [Specific indicators confirming the problem]
```

### Stage 2: Root Cause Analysis (Confidence: X.XX)

```markdown
- **Hypothesis 1**: [Most likely cause] → Likelihood: XX%
  - Evidence for: [Supporting data]
  - Evidence against: [Contradicting data]
- **Hypothesis 2**: [Alternative cause] → Likelihood: XX%
  - Evidence for: [Supporting data]
  - Evidence against: [Contradicting data]
- **Selected Hypothesis**: [Which one and why]
- **Similar Past Cases**:
  - `git log --grep="[related keyword]" --oneline | head -5`
  - Reference: [commit hash if found]
```

### Stage 3: Solution Selection (Confidence: X.XX)

```markdown
- **Option A**: [Approach name]
  - Implementation: [Brief how]
  - Pros: [Benefits]
  - Cons: [Drawbacks]
  - Past Success Rate: [If similar solution used before]
- **Option B**: [Alternative approach]
  - Implementation: [Brief how]
  - Pros: [Benefits]
  - Cons: [Drawbacks]
- **Decision**: [Selected option]
- **Rationale**: [Why this option over others]
- **Confidence Factors**:
  - Clear requirements: ✓/✗
  - Similar past success: ✓/✗
  - Low risk: ✓/✗
  - Aligns with principles: ✓/✗
```

### Stage 4: Implementation Strategy (Confidence: X.XX)

```markdown
- **Approach**: [Incremental/Big-bang/Parallel]
- **Key Decisions**:
  1. [Technical choice 1]: [Why]
  2. [Technical choice 2]: [Why]
- **Risk Mitigation**: [How to handle identified risks]
- **Validation Method**: [How to verify success]
```

### Overall Decision Confidence

```markdown
| Stage | Confidence | Key Factor |
|-------|------------|------------|
| Problem ID | X.XX | [Main confidence driver] |
| Root Cause | X.XX | [Main confidence driver] |
| Solution | X.XX | [Main confidence driver] |
| Implementation | X.XX | [Main confidence driver] |
| **Overall** | **X.XX** | **[Weighted average]** |
```

### Phase 3: Implementation Planning

Detailed execution strategy:

1. **Task Decomposition**: Break into atomic units
2. **Dependency Mapping**: Order and relationships
3. **Risk Mitigation**: Contingency plans
4. **Success Metrics**: How to measure completion

## Risk Assessment Framework

### Technical Risk Matrix

```markdown
| Risk Factor | Level | Impact | Mitigation |
|------------|-------|--------|------------|
| Breaking Changes | High/Med/Low | Users affected | Strategy |
| Performance Impact | High/Med/Low | Response time | Optimization |
| Security Concerns | High/Med/Low | Vulnerability | Prevention |
| Test Coverage Gap | High/Med/Low | Quality risk | Test plan |
| Technical Debt | High/Med/Low | Future cost | Refactoring |
```

### Complexity Scoring

- **Simple** (1-3): Single file, clear logic, < 50 lines
- **Medium** (4-6): Multiple files, some dependencies, < 200 lines
- **Complex** (7-9): Many files, complex logic, > 200 lines
- **Very Complex** (10): Architectural changes, multiple systems

## Solution Evaluation with Confidence

### Multi-Solution Analysis

```markdown
## Solution Options

### Option 1: [Approach Name] (Confidence: 0.85)
- **Description**: [What and how]
- **Pros**: [Benefits]
- **Cons**: [Drawbacks]
- **Risk Level**: Low/Medium/High
- **Implementation Time**: [Estimate]
- **SOLID Adherence**: [Score/10]
- **Why Confidence 0.85**: [Evidence]

### Option 2: [Approach Name] (Confidence: 0.70)
[Similar structure...]

### Option 3: [Approach Name] (Confidence: 0.60)
[Similar structure...]

## Recommended Solution: Option 1
**Rationale**: [Why this option based on scores]
```

## Enhanced SOW Format

```markdown
# SOW: [Title]
**Date**: [YYYY-MM-DD]
**Complexity**: [Score/10]
**Risk Level**: [Low/Medium/High]
**Confidence**: [Overall confidence score]

## Executive Summary
[1-2 paragraphs for stakeholders]

## Problem Analysis
### Current State
- **Problem**: [Clear description]
- **Evidence**: [Data/metrics showing the problem]
- **Impact**: [Who/what is affected]
- **Root Cause**: [Why it exists]

### Desired State
- **Goal**: [What success looks like]
- **Success Metrics**: [How to measure]
- **Constraints**: [Limitations]

## Solution Architecture

### Selected Approach (Confidence: [score])
[Detailed solution description]

### SOLID Principles Application
- **SRP**: [How responsibilities are separated]
- **OCP**: [Extension points identified]
- **LSP**: [Substitution principles followed]
- **ISP**: [Interface segregation approach]
- **DIP**: [Dependency abstractions]

### Technical Design
- **Components**: [New/modified components]
- **Data Flow**: [How data moves]
- **State Management**: [State changes]
- **Error Handling**: [Failure scenarios]

## Implementation Plan

### Phase 1: Foundation (Day 1)
| Task | Description | Time | Risk | Dependencies |
|------|-------------|------|------|--------------|
| 1.1 | [Task] | 1h | Low | None |
| 1.2 | [Task] | 2h | Med | 1.1 |

### Phase 2: Core Implementation (Day 2-3)
[Similar table structure]

### Phase 3: Testing & Refinement (Day 4)
[Similar table structure]

## Risk Analysis

### Identified Risks
| Risk | Probability | Impact | Mitigation | Contingency |
|------|------------|--------|------------|-------------|
| [Risk 1] | High/Med/Low | High/Med/Low | [Prevention] | [If occurs] |

### Technical Debt Assessment
- **Added Debt**: [What shortcuts taken]
- **Resolved Debt**: [What improved]
- **Net Impact**: [Overall effect]

## Resource Requirements
- **Developer Time**: [Total hours]
- **Review Time**: [Hours needed]
- **Testing Time**: [QA hours]
- **Dependencies**: [External needs]

## Success Criteria
1. ✓ [Measurable criterion]
2. ✓ [Measurable criterion]
3. ✓ [Measurable criterion]

## Rollback Plan
[How to revert if issues arise]

## Appendix
- **Related Issues**: [Links]
- **Similar Implementations**: [References]
- **Documentation Updates**: [Required docs]
```

## TodoWrite Integration

Automatic task creation with priorities:

```markdown
# Planning: [Topic]
1. ⏳ Analyze problem and gather context (15 min) [P1]
2. ⏳ Generate solution options (20 min) [P1]
3. ⏳ Evaluate against principles (15 min) [P2]
4. ⏳ Assess risks and complexity (10 min) [P2]
5. ⏳ Create detailed implementation plan (20 min) [P1]
6. ⏳ Document SOW (10 min) [P3]
7. ⏳ Review and finalize (10 min) [P3]
```

## Interactive Planning Mode

### Requirements Clarification

When confidence < 0.7, ask:

```markdown
## Clarification Needed
To increase planning confidence, please confirm:
1. **Requirement**: [What's unclear]
   - Option A: [Interpretation 1]
   - Option B: [Interpretation 2]

2. **Constraint**: [What limitation]
   - Current assumption: [What we think]
   - Please confirm: [Yes/No/Specify]
```

### Solution Validation

Before finalizing high-risk plans:

```markdown
## Risk Validation
This plan involves [high-risk element]:
- **Risk**: [Description]
- **Impact if wrong**: [Consequence]
- **Alternative**: [Safer option]

Proceed with risky approach? (Y/n/alternative)
```

## Decision Criteria Framework

### When to Use Each Planning Depth

#### Quick Planning (10-15 min)

- Complexity < 3
- Single file changes
- Well-understood problem
- Low risk

Command: `/think --quick`

#### Standard Planning (30-45 min)

- Complexity 4-6
- Multiple files
- Some unknowns
- Medium risk

Command: `/think` (default)

#### Deep Planning (60+ min)

- Complexity > 7
- Architectural changes
- Many unknowns
- High risk

Command: `/think --deep`

## SOW Quality Metrics

Track planning effectiveness:

- **Accuracy**: Estimated vs actual time
- **Completeness**: Tasks added during implementation
- **Risk Prediction**: Predicted vs encountered issues
- **Confidence Calibration**: Confidence vs success rate

## Advanced Features

### Historical Analysis

Learn from past implementations:

```bash
git log --oneline --since="6 months ago" --grep="similar" | head -5
```

### Dependency Impact Analysis

Understand ripple effects:

```bash
grep -l "ComponentName" **/*.{ts,tsx,js,jsx} 2>/dev/null | wc -l | xargs -I {} echo "Files depending on component: {}"
```

### Performance Baseline

For optimization planning:

```bash
cat .metrics/performance.json 2>/dev/null | jq '.current' || echo "No performance baseline"
```

## Usage Examples

### Quick Planning

```bash
/think --quick "Fix login button disabled state"
# Fast planning for simple issue
```

### Standard Planning

```bash
/think "Add user preference system"
# Balanced planning for feature
```

### Deep Planning

```bash
/think --deep "Migrate to new state management"
# Comprehensive planning for major change
```

### From Issue

```bash
/think "https://github.com/owner/repo/issues/123"
# Plan from GitHub issue
```

## Next Steps After Planning

- **High Confidence (>0.8)** → Proceed to `/research` or `/code`
- **Medium Confidence (0.6-0.8)** → Additional `/research` recommended
- **Low Confidence (<0.6)** → Clarification needed before proceeding

## Best Practices

1. **Always Consider Multiple Solutions**: Never settle for first idea
2. **Score Everything**: Confidence, risk, complexity
3. **Document Assumptions**: Make implicit explicit
4. **Plan for Failure**: Include rollback strategies
5. **Measure Success**: Define clear criteria
6. **Learn from History**: Check past similar work

## SOW Storage

Save all SOWs for future reference:

```bash
.claude/workspace/sow/
├── YYYY-MM-DD-[title].md      # Active SOWs
├── completed/                   # Finished work
│   └── YYYY-MM-DD-[title].md
└── archived/                    # Cancelled/outdated
    └── YYYY-MM-DD-[title].md
```

Move to `completed/` when implementation done.
Archive outdated plans for historical reference.
