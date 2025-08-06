---
name: search
description: Gemini CLIを使用してGoogle検索を実行
priority: medium
suitable_for:
  scale: [small, medium, large]
  type: [research, exploration]
  understanding: "any"
  urgency: [low, medium, high]
aliases: [gsearch, google]
timeout: 30
context:
  files_changed: "none"
  lines_changed: "0"
  new_features: false
  breaking_changes: false
---

# /gemini:search - Google Search via Gemini

## Purpose
Use Gemini CLI to perform Google searches and get comprehensive results with AI-powered insights.

## Usage
Describe what you want to search:
- "Latest React performance optimization techniques"
- "TypeScript 5.0 new features"
- "Best practices for API security 2024"

## Execution Strategy

### 1. Query Optimization
- Enhance search terms for better results
- Add relevant keywords and timeframes
- Focus on authoritative sources

### 2. Search via Gemini
```bash
gemini --prompt "Search and summarize: {{query}}
Focus on:
- Latest information (prioritize recent sources)
- Authoritative sources
- Practical examples
- Key insights and trends"
```

### 3. TodoWrite Integration
Track search progress:
```
# Search: [topic]
1. ⏳ Execute search
2. ⏳ Analyze results
3. ⏳ Extract key findings
```

## Search Types

### Technical Research
```bash
gemini -p "Technical search: {{query}}
Include:
- Official documentation
- GitHub repositories
- Stack Overflow solutions
- Technical blog posts"
```

### Best Practices
```bash
gemini -p "Best practices search: {{query}}
Focus on:
- Industry standards
- Expert recommendations
- Case studies
- Common pitfalls"
```

### Troubleshooting
```bash
gemini -p "Troubleshooting search: {{query}}
Find:
- Common causes
- Solution approaches
- Similar issues
- Workarounds"
```

## Output Format
```markdown
## Search Results: [Query]

### Key Findings
- [Main insight 1]
- [Main insight 2]
- [Main insight 3]

### Relevant Sources
1. [Source with brief description]
2. [Source with brief description]

### Recommended Actions
- [Next step based on findings]
```

## When to Use
- Researching new technologies
- Finding best practices
- Troubleshooting errors
- Exploring implementation approaches
- Staying updated with trends

## When NOT to Use
- Simple factual queries (use WebSearch)
- Local codebase search (use Grep/Glob)
- API documentation (use official docs)

## Example Usage
```
/gemini:search "React Server Components production deployment"
/gemini:search "Solving N+1 query problem in GraphQL"
/gemini:search "Kubernetes autoscaling best practices 2024"
```

## Tips
1. **Be specific** - Include context and constraints
2. **Add timeframe** - "2024", "latest", "recent"
3. **Specify domain** - "TypeScript", "React", "Node.js"
4. **Request format** - "with examples", "step-by-step"

## Prerequisites
- Gemini CLI installed and configured
- Internet connection
- Valid Gemini API credentials

## Next Steps
- Promising findings → `/research` for deeper dive
- Implementation ideas → `/think` for planning
- Quick fixes found → `/fix` to apply
