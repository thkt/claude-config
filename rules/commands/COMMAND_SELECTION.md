# Command Selection Algorithm

## Overview

Match commands to tasks based on intent and requirements, not keywords.

## Process

### 1. Command Discovery

- Scan `~/.claude/commands/` and `.claude/commands/`
- Read YAML metadata from command files
- Build available command list

### 2. Task Analysis

Understand what the user wants:

- **Intent**: Fix bug, add feature, investigate, optimize?
- **Scope**: Single file or multiple components?
- **Complexity**: Simple change or multi-step process?

### 3. Pattern Matching

Match task characteristics to commands:

| Task Intent | Primary Command | Alternative |
|------------|-----------------|-------------|
| Fix small bug | `/fix` | `/hotfix` (if production) |
| Add feature | `/think` → `/code` → `/test` | - |
| Investigate issue | `/research` → `/fix` | - |
| Emergency fix | `/hotfix` | - |
| Understand code | `/research` | - |
| Plan complex work | `/think` | - |

### 4. Selection Criteria

Choose command based on:

- **Understanding level**: ≥ 70% for command suggestion
- **Task complexity**: Single vs multi-step
- **Environment**: Development vs production
- **Urgency**: Normal vs critical

## Examples

### Example 1: Bug Investigation

User: "The authentication is broken"

- **Intent**: Fix bug
- **Needs investigation**: Yes
- **Result**: `/research` → `/fix`

### Example 2: Feature Request

User: "Add dark mode toggle"

- **Intent**: Add feature
- **Complexity**: Multi-step
- **Result**: `/think` → `/code` → `/test`

### Example 3: Production Emergency

User: "Site is down, database connection failing"

- **Urgency**: Critical
- **Environment**: Production
- **Result**: `/hotfix`

## Edge Cases

### Ambiguous Intent

When unclear, ask for clarification in understanding check.

### No Command Match

Use `Command: N/A` and proceed with direct implementation.

### Multiple Valid Approaches

Present options in understanding check for user to choose.
