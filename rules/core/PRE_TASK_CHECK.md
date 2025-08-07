# Pre-Task Understanding Check

Technical specification for understanding check and execution planning.

## Execution Rule

**PRIMARY**: PRE_TASK_CHECK is executed for tasks that involve:

- File operations (create/edit/delete)
- Command executions (bash, npm, etc.)
- Multi-step workflows
- Ambiguous or complex requests
- When understanding is below 95%

**SKIP CONDITIONS** (AI judgment allowed):

- Simple factual questions ("What is X?")
- Confirmation responses ("y", "yes", "ok")
- Direct information queries about existing content
- Follow-up clarifications that don't require action
- Requests for explanations or documentation

**ALWAYS REQUIRED FOR**:

- Any file system modifications
- Code implementation requests
- System commands execution
- Tasks requiring /commands
- When user explicitly requests planning

## Analysis Method

Analyze the user request to determine:

- Understanding percentage based on available information
- Clear and unclear elements
- Appropriate commands or approach
- Feasibility of execution

## Display Format

Standard format for understanding check (when required):

```markdown
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🧠 Understanding Level: [progress bar] XX%

✅ Elements I understand clearly:
- [Items with complete information]

❓ Unclear or assumed elements:
- [Ambiguous parts]

📋 Additional information I'd like to confirm:
- [Required specifications]

💡 Suggested approach:
- Command: [/command or N/A]
- Reason: [Brief explanation]

⚡ Feasibility: 🟢 Immediately executable / 🟡 Additional info needed / 🔴 Significant gap

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Is this understanding correct? An execution plan will be shown if needed. (Y/n/i)
```

**[STOP HERE - Wait for user response]**

Note: Output labels will be translated to Japanese per CLAUDE.md P1 rule

Progress bar: █ = 10% (fill left to right, use ░ for empty)

## Command Suggestion System

**When to suggest commands**: Understanding ≥ 70%, technical tasks
**Note**: This is ONLY for command suggestions, NOT for understanding check display
**Sources**: ~/.claude/commands/, .claude/commands/

### Dynamic Discovery

1. Scan directories for *.md files
2. Extract YAML metadata (if present)
3. Analyze task characteristics
4. Score & rank commands

### Task Analysis

Based on understanding the actual task intent and requirements.
See: [@../commands/COMMAND_SELECTION.md] for detailed algorithm

### Output Format

**IMPORTANT**: Command field MUST contain ONLY slash commands or "N/A". Never put descriptions or other text.

**Single command**:

```markdown
💡 Suggested approach:
- Command: /fix
- Reason: Best match for small fix, 90% understanding
```

**Workflow** (multi-action detected):

```markdown
💡 Suggested workflow:
- Steps: /think → /code → /test
- Reason: Complex task requiring planning
- TodoWrite: Will create 3 tasks automatically
```

**No command match**:

```markdown
💡 Suggested approach:
- Command: N/A
- Reason: No specific command needed for this task
```

## Standard Workflows

- **Bug Fix**: Investigate+Fix → `/research → /fix`
- **Feature**: Implement+Test → `/think → /research → /code → /test`
- **Emergency**: Critical+Production → `/hotfix`

Details: [@../commands/STANDARD_WORKFLOWS.md]

## User Response Handling

**Important: Always wait for user response after showing understanding check**

- Y: Proceed with implementation (show execution plan if needed)
- n: Re-evaluate task understanding
- i: Wait for additional information

## Execution Plan (After Y Confirmation)

Display for operations that will modify files or execute commands.
Skip for pure read operations (Read, Grep, LS).

```markdown
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 Execution Plan

Will execute the following:
1. [Specific action]
2. [Specific action]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Proceed with this plan? (Y/n/i)
```

**[STOP HERE - Wait for user response]**

**Examples**:

- File creation: "Create new file /path/to/file.js"
- File edit: "Edit /path/to/file.js - add error handling"
- Command execution: "Run npm test to verify changes"

**Important: Wait for user confirmation before proceeding.**

## Edge Cases

- No match (score <30): "Command: N/A"
- Complex task: Suggest workflow
- New commands: Auto-discovered if in command dirs

## Integrated Workflow

1. **Understanding Check**: Assess comprehension & suggest approach
2. **User Confirmation**: Wait for Y/n/i ← **STOP POINT**
3. **Execution Plan** (if Y and file/command ops): Show specific actions
4. **Plan Confirmation**: Wait for final Y/n/i ← **STOP POINT**
5. **Execute**: Perform the approved actions
