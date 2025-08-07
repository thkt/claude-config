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
allowed-tools: Bash(find:*), Bash(tree:*), Bash(ls:*), Bash(cat package.json:*), Read, Glob, Grep, LS, Task
context:
  project_structure: "dynamic"
  tech_stack: "discovered"
  dependencies: "analyzed"
  patterns: "identified"
---

# /research - Advanced Project Research & Technical Investigation

## Purpose

Investigate codebase with dynamic discovery, parallel search execution, and confidence-based findings, without implementation commitment.

## Dynamic Project Discovery

### Project Structure
Use tree or ls to explore:
```bash
tree -L 2 -I 'node_modules|dist|build|coverage|.git' | head -20
# or
ls -la
```

### Technology Stack
Check package.json for frameworks:
```bash
cat package.json | grep -E '"(react|vue|angular|next|nuxt|svelte|express|fastify|nest)"'
```

### Language Distribution
Find source file types:
```bash
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.py" -o -name "*.go" \) -not -path "*/node_modules/*" | sed 's/.*\.//' | sort | uniq -c | sort -rn
```

### Dependencies Analysis
List main dependencies:
```bash
cat package.json | jq -r '.dependencies | keys[]' | head -10
```

### Configuration Files
Locate config files:
```bash
ls -la *.config.* *.json *.yml *.yaml | grep -v node_modules
```

## Hierarchical Research Process

### Phase 1: Scope Discovery
Analyze project to understand:
1. **Architecture**: Identify project structure and patterns
2. **Technology**: Detect frameworks, libraries, tools
3. **Conventions**: Recognize coding standards and practices
4. **Entry Points**: Find main files, exports, APIs

### Phase 2: Parallel Investigation
Execute searches concurrently for efficiency:
- **Pattern Search**: Multiple grep operations in parallel
- **File Discovery**: Simultaneous glob patterns
- **Dependency Tracing**: Parallel import analysis
- **Documentation Scan**: Concurrent README/docs reading

### Phase 3: Synthesis & Scoring
Consolidate findings with confidence levels:
1. **Confidence Scoring**: Rate each finding (0.0-1.0)
2. **Pattern Recognition**: Identify recurring themes
3. **Relationship Mapping**: Connect related components
4. **Priority Assessment**: Rank by importance

## Research Strategies

### Quick Scan (1-2 min)
Surface-level understanding:
```bash
find . -type f -name "*.md" -not -path "*/node_modules/*" | head -5 | xargs head -20
```

Command: `/research --quick`

### Standard Research (3-5 min)
Balanced depth and breadth:
- Core architecture understanding
- Key patterns identification
- Main dependencies analysis

Command: `/research` (default)

### Deep Dive (5-10 min)
Comprehensive investigation:
- Complete architecture mapping
- All patterns and relationships
- Full dependency graph
- Historical context (git history)

Command: `/research --deep`

### Focused Research
Target specific areas:
- `/research --auth` - Authentication system
- `/research --api` - API structure
- `/research --state` - State management
- `/research --data` - Data flow

## Efficient Search Patterns

### Parallel Execution Example
```typescript
// Execute these simultaneously, not sequentially
const searches = [
  Grep({ pattern: "class.*Controller", glob: "**/*.ts" }),
  Grep({ pattern: "export.*function", glob: "**/*.js" }),
  Glob({ pattern: "**/*.test.*" }),
  Glob({ pattern: "**/api/**" })
];
```

### Smart Pattern Selection
Based on initial discovery:
- **React Project**: Search for hooks, components, context
- **API Project**: Search for routes, controllers, middleware
- **Library Project**: Search for exports, types, tests

## Confidence-Based Findings

### Finding Classification
```markdown
## High Confidence Findings (> 0.8)
### Authentication System
- **Location**: src/auth/*
- **Type**: JWT-based
- **Confidence**: 0.95
- **Evidence**: Multiple JWT imports, token validation middleware
- **Dependencies**: jsonwebtoken, bcrypt
- **Entry Points**: auth.controller.ts, auth.middleware.ts

## Medium Confidence Findings (0.5 - 0.8)
### State Management
- **Pattern**: Redux-like pattern detected
- **Confidence**: 0.7
- **Evidence**: Actions, reducers folders found
- **Uncertainty**: Actual library unclear (Redux/MobX/Zustand?)

## Low Confidence Findings (< 0.5)
### Possible Patterns
- May use microservices (0.4) - multiple service folders
- Might have WebSocket support (0.3) - socket.io in dependencies
```

## TodoWrite Integration

Automatic task tracking:
```markdown
# Research: [Topic]
1. ⏳ Discover project structure (30 sec)
2. ⏳ Identify technology stack (30 sec)
3. ⏳ Execute parallel searches (2 min)
4. ⏳ Analyze findings (1 min)
5. ⏳ Score confidence levels (30 sec)
6. ⏳ Synthesize report (1 min)
```

## Task Agent Usage

### When to Use Task Agent
Use `general-purpose` agent for:
- **Complex Investigations**: 10+ related searches
- **Exploratory Analysis**: Unknown structure
- **Relationship Mapping**: Understanding connections
- **Historical Research**: Git history analysis

### Task Agent Example
```typescript
Task({
  subagent_type: "general-purpose",
  description: "Authentication flow analysis",
  prompt: `Investigate the complete authentication system:
    1. Find all auth-related files
    2. Map the authentication flow
    3. Identify security patterns
    4. Trace token lifecycle
    5. Document API endpoints
    Return a comprehensive auth architecture report`
})
```

## Advanced Features

### Cross-Reference Analysis
Connect findings across different areas:
```bash
grep -l "AuthController" **/*.ts | xargs grep -l "UserService"
```

### Import Dependency Graph
Trace module dependencies:
```bash
grep -h "^import.*from" **/*.ts | sed "s/.*from ['\"]\.\/\(.*\)['\"].*/\1/" | sort | uniq -c | sort -rn | head -10
```

### Pattern Frequency Analysis
Identify common patterns:
```bash
grep -oh "use[A-Z][a-zA-Z]*" **/*.tsx | sort | uniq -c | sort -rn | head -10
```

### Historical Context
Understand evolution:
```bash
git log --oneline --since="3 months ago" --pretty=format:"%h %s" | head -10
```

## Output Format

```markdown
## Research Summary
- **Scope**: [What was researched]
- **Duration**: [Time taken]
- **Confidence**: [Overall confidence score]
- **Coverage**: [% of codebase analyzed]

## Key Discoveries

### Architecture (Confidence: 0.9)
- **Pattern**: [MVC/Microservices/Monolith]
- **Structure**: [Description]
- **Entry Points**: [Main files]

### Technology Stack (Confidence: 0.95)
- **Framework**: [React/Vue/Express/etc]
- **Language**: [TypeScript/JavaScript]
- **Key Libraries**: [List]

### Code Patterns (Confidence: 0.85)
- **Design Patterns**: [Observer/Factory/etc]
- **Conventions**: [Naming/Structure]
- **Best Practices**: [Identified patterns]

## Findings by Confidence

### High Confidence (>0.8)
1. [Finding with evidence]
2. [Finding with evidence]

### Medium Confidence (0.5-0.8)
1. [Finding with uncertainty noted]
2. [Finding with assumptions]

### Low Confidence (<0.5)
1. [Possible pattern]
2. [Needs verification]

## Relationships Discovered
- [Component A] → [Component B]: [Relationship type]
- [Service X] ← [Module Y]: [Dependency]

## Recommendations
1. **Immediate Focus**: [Most important areas]
2. **Further Investigation**: [Areas needing deeper research]
3. **Implementation Approach**: [If moving to /code]

## References
- Key Files: [List with paths]
- Documentation: [Links/paths]
- External Resources: [If found]
```

## Persistent Documentation

For significant findings, save to:
```bash
.claude/workspace/research/YYYY-MM-DD-[topic].md
```

Include:
- Architecture diagrams (ASCII)
- Dependency graphs
- Key code snippets
- Future reference notes

## Usage Examples

### Quick Research
```bash
/research --quick "API structure"
# Fast overview of API organization
```

### Standard Research
```bash
/research "authentication implementation"
# Balanced investigation of auth system
```

### Deep Research
```bash
/research --deep "complete data flow"
# Comprehensive analysis from UI to database
```

### Focused Research
```bash
/research --state "Redux implementation"
# Targeted state management investigation
```

## Best Practices

1. **Start Broad**: Get overview before diving deep
2. **Parallel Search**: Execute multiple searches simultaneously
3. **Score Confidence**: Always rate findings reliability
4. **Document Patterns**: Note recurring themes
5. **Map Relationships**: Connect components
6. **Save Important Findings**: Persist for future reference

## Performance Tips

### Optimize Searches
- Use specific globs: `**/*.controller.ts` not `**/*`
- Limit depth when possible: `-maxdepth 3`
- Exclude irrelevant: `-not -path "*/test/*"`

### Efficient Patterns
- Batch related searches together
- Use Task agent for 10+ operations
- Cache common queries results

## Next Steps

- **Found Issues** → `/fix` for targeted solutions
- **Need Planning** → `/think` for architecture decisions
- **Ready to Build** → `/code` for implementation
- **Documentation Needed** → Create comprehensive docs
