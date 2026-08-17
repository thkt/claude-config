# Skills & Agents Design

Design intent and usage guidelines for Skills and Agents.

📌 **[日本語版](../.ja/docs/SKILLS_AGENTS.md)**

## Core Concept

```mermaid
graph LR
    subgraph Skills["Skills (Knowledge)"]
        S1[use-workflow-tdd-cycle]
        S2[use-context-reviewer-security]
    end

    subgraph Agents["Agents (Execution)"]
        A1[generator-test]
        A2[reviewer-security]
        A3[enhancer-integration]
    end

    subgraph Trigger["Invocation"]
        CMD[Command] --> S1
        CMD --> A1
        CTX[Context] -.-> S2
        TASK[Task Tool] --> A2
    end
```

## Skills vs Agents

`dr` creates a DR file and index through Write/Edit, and `commit` runs
`git commit`. Skill state and output therefore depend on the permitted tools and
procedure.

| Aspect         | Skills                         | Agents        |
| -------------- | ------------------------------ | ------------- |
| **Role**       | Knowledge base or procedure    | Executor (Do) |
| **Invocation** | Auto-load or command reference | Via Task tool |
| **Context**    | Main or fork                   | Always fork   |
| **State**      | Read-only or mutable           | Mutable       |
| **Output**     | Information, files, or actions | Artifacts     |

## Skills

### Purpose

Skills are "knowledge modules" that provide domain-specific knowledge when AI executes tasks.

### Categories

`/code`, `/audit`, and `/polish` are workflows under `workflows/*.js`, not
Skills. The User-invocable row lists all 17 current Skills.

| Category       | Skills                                                                                                                          | Purpose                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Workflow       | use-workflow-tdd-cycle, use-workflow-pageshot                                                                                   | Multi-phase workflow definitions |
| Context        | use-context-reviewer-\*, use-context-root-cause-analysis                                                                        | Domain knowledge for agents      |
| CLI wrapper    | use-cli-codegraph, use-cli-recall, use-cli-scout, use-cli-gcloud                                                                | CLI tool integration             |
| User-invocable | census, challenge, checkout, commit, dr, fix, issue, outcome, pr, preview, qualify, research, scribe, slice, stock, think, xlsx | Slash command entry points       |

### Loading Mechanism

```mermaid
flowchart TD
    A[User Input] --> B{Trigger Match?}
    B -->|Keyword| C[Auto-load Skill]
    B -->|Flag| D[Conditional Load]
    B -->|Command| E[Reference in Command]
    C --> F[Skill Context Added]
    D --> F
    E --> F
```

**Trigger Examples:**

| Trigger                 | Skill Loaded                    |
| ----------------------- | ------------------------------- |
| "TDD", "test-driven"    | use-workflow-tdd-cycle          |
| "OWASP", "セキュリティ" | use-context-reviewer-security   |
| "5 Whys", "root cause"  | use-context-root-cause-analysis |

### File Structure

```text
skills/[skill-name]/
├── SKILL.md        # Required: YAML front matter + knowledge body
└── references/     # Optional: detailed guides
    └── *.md
```

### YAML Front Matter

```yaml
---
name: use-workflow-tdd-cycle
description: TDD with RGRC cycle and Baby Steps.
when_to_use: TDD, テスト駆動, Red-Green-Refactor, Baby Steps
allowed-tools: Read Write Edit Bash(ugrep:*) Bash(bfs:*)
context: fork # fork or inline
background: false
user-invocable: false # Whether invocable as slash command
---
```

## Agents

### Purpose

Agents are "specialized executors" spawned via the Task tool to autonomously
perform specific analysis or generation tasks.

### Categories

```text
agents/
├── critics/        # Critical verification (critic-audit, critic-design, critic-evidence)
├── enhancers/      # Code improvement + synthesis (enhancer-code, enhancer-evidence, enhancer-integration)
├── explorers/      # Exploration (explorer-feature)
├── generators/     # Generation (generator-test, generator-snapshot)
├── resolvers/      # Problem resolution (resolver-build)
└── reviewers/      # Review (18 specialized reviewers)
```

### Reviewer Agents (18 types)

| Agent                  | Focus                             |
| ---------------------- | --------------------------------- |
| reviewer-accessibility | WCAG 2.2 conformance              |
| reviewer-causation     | 5 Whys root cause analysis        |
| reviewer-conformance   | Diff-vs-spec conformance          |
| reviewer-coverage      | Test coverage quality             |
| reviewer-design        | Module depth via deletion test    |
| reviewer-duplication   | Cross-file DRY analysis           |
| reviewer-efficiency    | Algorithmic cost, hot paths       |
| reviewer-operations    | Error boundaries, logging         |
| reviewer-progressive   | CSS-first, JS reduction           |
| reviewer-prompt        | LLM prompt definition quality     |
| reviewer-react-pattern | React design patterns             |
| reviewer-readability   | Code structure, readability       |
| reviewer-resilience    | Resilience weakness analysis      |
| reviewer-reuse         | Existing code reuse opportunities |
| reviewer-rust          | Rust idioms and safety            |
| reviewer-security      | OWASP Top 10                      |
| reviewer-silence       | Silent failure detection          |
| reviewer-testability   | Testable code design              |

### Invocation via Task Tool

```markdown
Task tool with:

- subagent_type: "reviewer-security"
- prompt: "Review the authentication module for vulnerabilities"
- model: "sonnet" (optional)
```

## Design Decisions

### Why Separate Skills and Agents?

| Reason                     | Explanation                                             |
| -------------------------- | ------------------------------------------------------- |
| **Separation of Concerns** | Separate knowledge (Skills) from execution (Agents)     |
| **Context Management**     | Agents run in fork, don't pollute main context          |
| **Reusability**            | Skills can be referenced from multiple commands         |
| **Specialization**         | Agents specialize in specific tasks for deeper analysis |

### Reference Depth Rule

```text
SKILL.md → reference.md (1 level only)
```

Reason: each extra level adds files to read and makes the reference graph harder to follow.

## Related

- [COMMANDS.md](./COMMANDS.md) - Commands, workflows, and the build-centered development flow
- [SKILLS](../rules/conventions/SKILLS.md) - Skill definition format
- [SUBAGENT](../rules/conventions/SUBAGENT.md) - Sub-agent definition format
