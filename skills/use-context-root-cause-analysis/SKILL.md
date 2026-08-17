---
name: use-context-root-cause-analysis
description: Root cause analysis with 5 Whys.
when_to_use: root cause, 5 Whys, なぜなぜ分析, 根本原因, 原因分析, symptom fix, 対症療法
allowed-tools: Read Task Bash(ugrep:*) Bash(bfs:*)
context: fork
user-invocable: false
---

# Root Cause Analysis - 5 Whys

## Principle

Fix the root cause, not the symptom. Symptom fixes add complexity; root-cause fixes prevent recurrence.

## 5 Whys Process

Ask "why" five times, descending through abstraction levels.

| Step | Level                    |
| ---- | ------------------------ |
| 1    | Observable fact          |
| 2    | Implementation detail    |
| 3    | Design decision          |
| 4    | Architectural constraint |
| 5    | Root cause               |

## Tips

| Tip                      | Description                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Stay factual             | Evidence, not assumptions                                                                                                              |
| Don't stop early         | First "why" is rarely root cause                                                                                                       |
| Don't go deep            | Stop when actionable                                                                                                                   |
| Validate                 | "Because [5], therefore [4]..."                                                                                                        |
| Verify fix               | "Will this prevent the problem?"                                                                                                       |
| Watch complexity signals | When intermittent / multiple independent changes overlap / behavior unexplained, enumerate ≥3 cause-layer candidates before converging |

## Output Format

| Field      | Description                              |
| ---------- | ---------------------------------------- |
| Symptom    | User-facing failure                      |
| Root cause | Why the failure occurred (5 Whys result) |
| Pattern    | Isolated / Recurring / Systematic        |

### Pattern Enum

Consumers such as the `/fix` Non-obvious flow branch on the Pattern field to decide whether to apply defense-in-depth or escalate.

| Value      | Meaning                                           |
| ---------- | ------------------------------------------------- |
| Isolated   | Single location, no recurrence path               |
| Recurring  | Similar code exists nearby, recurrence possible   |
| Systematic | Design-rooted, architecture-level recurrence risk |

## References

| Topic                | File                                               |
| -------------------- | -------------------------------------------------- |
| Worked examples      | ${CLAUDE_SKILL_DIR}/references/five-whys.md        |
| Symptom → Root Cause | ${CLAUDE_SKILL_DIR}/references/symptom-patterns.md |
