# Agent Usage Documentation

## Agent Categories and Usage

### Active Agents (Used by Commands)

#### Orchestrators
- **review-orchestrator** - Used by `/review` command to coordinate all review activities

#### Frontend Reviewers (Used by `/review`)
- **readability-reviewer** - Code readability and clarity
- **structure-reviewer** - Code organization and architecture
- **root-cause-reviewer** - Deep problem analysis
- **type-safety-reviewer** - TypeScript type safety
- **performance-reviewer** - Performance optimization
- **security-reviewer** - Security vulnerabilities
- **accessibility-reviewer** - WCAG compliance
- **design-pattern-reviewer** - React patterns
- **testability-reviewer** - Test design

#### General Reviewers (Used by `/review`)
- **progressive-enhancer** - Progressive enhancement approach

### Internal/Utility Agents (Not directly exposed via commands)

#### document-reviewer
**Purpose**: Review technical documentation quality
**Use Cases**:
- Review README.md files when created/updated
- Validate API documentation
- Check rule files and configuration docs
- Could be invoked by other agents when documentation needs review

**Suggested Integration**:
- Auto-trigger on `.md` file changes
- Add to `/review` when documentation files are included
- Use with `/code` when generating documentation

#### subagent-reviewer
**Purpose**: Meta-agent for reviewing agent definition files
**Use Cases**:
- Validate new agent definitions before activation
- Review agent YAML frontmatter format
- Check tool permissions and model selection
- Ensure consistency across agent definitions

**Suggested Integration**:
- Auto-trigger when creating new agents
- Use as part of system maintenance
- Could be a separate `/review-agents` command

## Recommendations

1. **Expose document-reviewer**: Add to `/review` command for documentation files
2. **Create `/review-agents` command**: Use subagent-reviewer for agent maintenance
3. **Auto-trigger**: Set up hooks to auto-run these agents on relevant file changes

## Color Assignment Reference

| Agent | Color | Semantic Meaning |
|-------|-------|-----------------|
| review-orchestrator | indigo | Leadership/Coordination |
| readability-reviewer | cyan | Clarity/Transparency |
| structure-reviewer | magenta | Architecture/Structure |
| root-cause-reviewer | red | Critical/Deep Analysis |
| type-safety-reviewer | cyan | Type System |
| performance-reviewer | orange | Speed/Optimization |
| security-reviewer | yellow | Warning/Security |
| accessibility-reviewer | pink | Inclusive Design |
| design-pattern-reviewer | purple | Patterns/Design |
| testability-reviewer | green | Testing/Success |
| progressive-enhancer | lime | Growth/Enhancement |
| document-reviewer | brown | Documentation/Paper |
| subagent-reviewer | gray | Meta/Neutral |
