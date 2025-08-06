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
requires: ["search tools"]
context:
  files_changed: "any"
  lines_changed: "any"
  new_features: true
  breaking_changes: true
---

# /think - Thinking & Planning

## Purpose
Perform detailed analysis of problems and create comprehensive plans (SOW) for implementation.

## Usage Modes
- **Standalone**: Plan for specific problems or features
- **Workflow**: Execute as first step in workflow, then proceed to `/research`

## Prerequisites
- No prerequisites for both standalone and workflow use

## Execution Steps

### 1. Problem Analysis
- Detailed understanding and definition of the problem
- Identify scope of impact
- Confirm relationships with existing implementation

### 2. Information Gathering
- Search related files (using Grep, Glob)
- Analyze existing code
- Research similar implementations

### 3. Requirements Organization
- Clarify functional requirements
- Confirm non-functional requirements
- Identify constraints

### 4. Solution Evaluation with SOLID Principles
Consider development principles as evaluation criteria:
- Would solution follow Progressive Enhancement?
- Will code be readable and maintainable?
- Are components properly separated?

- Apply SOLID design principles during evaluation:
  - **SRP**: Each component has one clear responsibility
  - **OCP**: Design for extension without modification
  - **LSP**: Ensure proper inheritance relationships
  - **ISP**: Prefer focused interfaces over large ones
  - **DIP**: Depend on abstractions, not implementations
- Compare approaches based on principle adherence
- Document SOLID application in SOW
- Consider extensibility and testability
- Evaluate risks and mitigations

### 5. Implementation Planning
- Break down tasks following SRP (each task = one responsibility)
- Design interfaces and contracts (DIP)
- Plan for extensibility (OCP)
- Prioritize based on dependencies
- Estimate work time
- Identify necessary resources

### 6. TodoWrite Integration
- Create planning tasks automatically
- Track SOW creation progress

### 7. SOW Quality Check
- Completeness of requirements
- Feasibility of approach
- Realistic time estimates

## Interactive Requirements Confirmation
When there are unclear points, ask questions such as:
- Specific behavioral requirements
- Error conditions
- Expected results

## SOW (Statement of Work) Format

```markdown
# [Title]

## 概要/目的
[Problem background and solution purpose]

## 現状の問題点
[Specific problems discovered through investigation]

## 関連ファイル
[List of files affected/to be referenced]

## 提案する解決策
[Details of selected solution approach]

### SOLID原則の適用
- SRP: [How responsibilities are separated]
- OCP: [How solution enables extension]
- DIP: [Key abstractions/interfaces]

## 実装計画
1. [Step 1 - single responsibility]
2. [Step 2 - single responsibility]
...

## 期待される効果
[Effects expected from implementation]

## 考慮事項
[Risks, constraints, notes]

## 作業時間見積もり
[Time required for each step]
```

## SOW Document Handling
- Save SOW to `.claude/workspace/tasks/active/` directory
- Create directory if it doesn't exist using `mkdir -p`
- Filename format: `YYYY-MM-DD-task-title.md`
- Example: `2024-03-15-user-auth-improvement.md`
- Use kebab-case for title portion
- Use Write tool to save the complete SOW
- Overwrite if updating existing task

## Definition of Done
Planning is complete when:
- Problem fully understood and documented
- All affected files identified
- Solution approach validated against SOLID principles
- Implementation steps clearly defined
- SOW document saved to workspace
- TodoWrite tasks created

## Command Selection Guide

### Use `/think` when:
- 📋 New feature implementation needed
- 🔄 Major refactoring required
- ❓ Problem not fully understood
- 📊 Multiple solutions to evaluate
- 🎯 Need comprehensive planning

### Use other commands instead:
- `/fix` - Small, well-understood issues
- `/research` - Technical investigation only
- `/code` - Implementation with clear requirements

## Next Steps
- **Workflow mode**: Based on SOW, proceed to `/research` for technical research
- **Standalone mode**: Based on SOW, proceed directly to implementation or other work

## Usage Examples
```
# Standalone use
/think "File upload error messages not displaying"

# Workflow use
/think "Improve PostFileUpload component"

# Analysis from Issue URL
/think "https://github.com/owner/repo/issues/123"
```

## Automatic Application
This command automatically applies SOLID design principles during:
- Solution architecture
- Component design
- Interface definition
- Dependency management

The principles guide decisions to create maintainable, flexible code.