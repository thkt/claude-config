# Model Selection Guidelines for Agents

## Overview

This document defines the criteria for selecting between `opus` and `sonnet` models for different agent types.

## Model Characteristics

### Opus
- **Strengths**: Complex reasoning, deep analysis, orchestration, multi-factor decision making
- **Best for**: Tasks requiring nuanced judgment, coordination of multiple concerns, root cause analysis
- **Resource usage**: Higher computational cost, slower response times

### Sonnet  
- **Strengths**: Pattern recognition, structured analysis, rule-based evaluation, consistent formatting
- **Best for**: Code reviews, pattern matching, compliance checking, structured reporting
- **Resource usage**: Lower computational cost, faster response times

## Selection Criteria

### Use Opus When:
1. **Orchestration Required**: Managing multiple sub-agents and integrating their results
2. **Deep Analysis Needed**: Finding root causes, understanding complex relationships
3. **Meta-Level Reasoning**: Analyzing the quality of other analyses or configurations
4. **Complex Trade-offs**: Balancing multiple competing concerns

### Use Sonnet When:
1. **Pattern-Based Review**: Checking against established patterns or rules
2. **Structured Analysis**: Following predefined checklists or criteria
3. **Single-Focus Review**: Evaluating one specific aspect (e.g., security, performance)
4. **Code Quality Checks**: Readability, style, best practices

## Current Assignments

### Opus Agents (3)
- `review-orchestrator`: Coordinates all review agents, integrates results
- `root-cause-reviewer`: Deep analysis to find fundamental problems
- `subagent-reviewer`: Meta-analysis of agent configurations

### Sonnet Agents (10)
- `accessibility-reviewer`: Pattern-based WCAG compliance
- `design-pattern-reviewer`: React pattern recognition
- `document-reviewer`: Structured documentation review
- `performance-reviewer`: Performance anti-pattern detection
- `progressive-enhancer`: CSS/HTML pattern suggestions
- `readability-reviewer`: Code readability patterns
- `security-reviewer`: Security vulnerability patterns
- `structure-reviewer`: Code organization patterns
- `testability-reviewer`: Testing pattern evaluation
- `type-safety-reviewer`: TypeScript pattern checking

## Decision Tree

```
Is the task primarily about:
├─ Coordinating multiple analyses? → Opus
├─ Finding root causes of complex issues? → Opus  
├─ Evaluating other evaluations? → Opus
└─ Checking against known patterns? → Sonnet
   ├─ Code quality patterns? → Sonnet
   ├─ Security patterns? → Sonnet
   ├─ Performance patterns? → Sonnet
   └─ Accessibility patterns? → Sonnet
```

## Future Considerations

- Monitor performance metrics to validate selections
- Consider model updates and capability changes
- Adjust based on user feedback and accuracy requirements
- Evaluate cost/benefit trade-offs periodically
