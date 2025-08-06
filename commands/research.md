---
name: research
description: プロジェクト理解と技術調査を行う（実装なし）
priority: medium
suitable_for:
  scale: [small, medium, large]
  type: [exploration, analysis, learning]
  understanding: "≥ 30%"
  urgency: [low, medium]
aliases: []
timeout: 90
context:
  files_changed: "none"
  lines_changed: "0"
  new_features: false
  breaking_changes: false
---

# /research - Project Understanding & Technical Research

## Purpose

Investigate codebase, research technical solutions, or understand existing implementations without implementation commitment.

## Usage

For exploration, learning, and research tasks that don't require immediate implementation.

## Execution Steps

### 1. Context Loading

- Quick project overview
- Identify relevant areas to explore

### 2. Deep Investigation

Choose the appropriate approach based on complexity:

#### For Simple Searches (Direct Tools)

- Use `Grep` for specific patterns: "Where is UserAuth class used?"
- Use `Glob` for file discovery: "Find all test files"
- Use `Read` for known files: "Examine auth.config.js"
- **IMPORTANT**: Execute multiple tools in parallel for efficiency
  Example: Search for class definition AND its usage simultaneously

#### For Complex Exploration (Task Agent)

**Use Task agent with subagent_type: general-purpose when:**

- Multi-step investigation needed
- Exploratory analysis without clear search targets
- Architectural understanding required

#### Task Agent Decision Guide

Use Task agent when you need:

- 10+ sequential search operations
- Context-aware exploration (understanding relationships)
- Comprehensive mapping of a system

Use direct tools when you need:

- < 10 specific searches
- Known file paths or patterns
- Quick verification of specific items

```md
Example: Using Task agent for authentication architecture
- Task(subagent_type="general-purpose",
      description="Auth investigation",
      prompt="Find and analyze all authentication-related files, security middleware, and map the complete auth flow from login to logout")
```

- Search and analyze code patterns
- Research technical documentation
- Understand architectural decisions
- Document findings

### 3. Synthesize Findings

- Consolidate results from all investigation tasks
- Analyze the combined data to identify key patterns, dependencies, and insights
- Structure the findings according to the standard output format

### 4. Persistent Documentation (Optional)

For significant findings:

- Save to `.claude/workspace/research/YYYY-MM-DD-topic.md`
- Only for discoveries that will guide future work
- Use Write tool to persist important architectural insights

## Workflow Position

```txt
[/think] → [/research] → [/code] → [/test]
           ↑ You are here
```

- **Input**: SOW from `/think` (if in workflow)
- **Output**: Technical details for `/code`
- **Standalone**: Pure exploration

## Efficient Research Patterns

### Pattern 1: Top-Down

1. Find entry points (main files, exports)
2. Trace down to implementations
3. Map dependencies

### Pattern 2: Bottom-Up

1. Find core implementations
2. Trace up to consumers
3. Understand usage patterns

### Pattern 3: Breadth-First

1. Survey all related files
2. Identify key patterns
3. Deep dive into critical areas

## Output Format

```markdown
## Exploration Summary
- Topic: [What was explored]
- Key Findings:
  - [Finding 1]
  - [Finding 2]
  - ...
- Code Patterns Discovered: [List patterns]
- Recommendations: [Next steps or insights]
- References: [Useful links/files]
```

## When to Use

- Understanding unfamiliar codebase
- Researching implementation options
- Investigating bugs (before fixing)
- Learning new libraries/frameworks
- Architectural analysis

## When NOT to Use

- When you already know what to implement
- For simple questions
- When immediate action is required

## Example Usage

### Simple Research (Direct Tools)

```md
/research "Find all API endpoints"
/research "Where is database connection configured?"
/research "List all React components"
```

### Complex Research (May use Task Agent)

```md
/research "How is authentication implemented in this project?"
/research "Analyze the state management architecture"
/research "Understand the complete data flow from frontend to database"
```

## Next Steps

- If planning needed: Use `/think` first
- If issues found: Create issues or use `/fix`
- If implementation needed: Continue with `/code`
