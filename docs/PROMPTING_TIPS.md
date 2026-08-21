# Prompting Tips

Effective prompting techniques for Claude Code.

## Redo & Improve

| Prompt                                                                           | Effect                                         | When                          |
| -------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------- |
| "Knowing everything you know now, scrap this and implement the elegant solution" | Better implementation with accumulated context | After mediocre implementation |

## Review & Verification

| Prompt                                                                 | Effect                             | When               |
| ---------------------------------------------------------------------- | ---------------------------------- | ------------------ |
| "Grill me on these changes and don't make a PR until I pass your test" | Turn Claude into a strict reviewer | Before PR creation |

## Context & Compute

| Strategy                          | When / Why                                                                  |
| --------------------------------- | --------------------------------------------------------------------------- |
| MCP tools ≤10 per project         | Each tool definition occupies context                                       |
| Enable only needed plugins        | Each adds token overhead                                                    |
| Append "use subagents" to request | Parallelizes a large task and keeps its exploration out of the main session |

## Debugging

| Prompt                        | Effect                             | When        |
| ----------------------------- | ---------------------------------- | ----------- |
| "Go fix the failing CI tests" | Let it run without micromanagement | CI failures |

## Workflow

| Technique                                             | Effect                          |
| ----------------------------------------------------- | ------------------------------- |
| `/think` → review with separate Claude session        | Improve plan quality            |
| Switch to `/think` the moment something goes sideways | Avoid wasting time on bad paths |
