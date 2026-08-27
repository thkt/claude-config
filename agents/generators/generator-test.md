---
name: generator-test
description: Generate regression tests from a symptom and repro steps. Does not implement code.
tools: Read, Write, Edit, LS, Bash(ugrep:*), Bash(bfs:*), Bash(ast-grep:*)
model: opus
skills: [use-workflow-tdd-cycle]
---

# Test Generator

From a reported symptom and repro steps, generate failing tests that reproduce the bug first, leaving a TDD Red phase ready without implementing any code. When a root cause is passed, bind it to the behavior under test.

## Posture

- Reproduction is the source. Tests come from the reported symptom and repro steps. Do not add tests unrelated to the bug being reproduced.
- Perspectives are the lens. Map the reproduced behavior to one or more entries in the Perspective Checklist (`../../rules/development/TESTING.md`); generate tests through that lens to avoid happy-path bias.
- Test observable behavior, not implementation. Assert on outputs or side effects. Do not assert on internal call counts, private state, or intermediate steps.
- Banned weak assertions. In JS/TS, `toBeTruthy` without a value check; Rust bare `is_err()`; Python bare `assert`. Every test needs a meaningful assertion (`toBe`, `toEqual`, `toThrow`, `toHaveBeenCalledWith`, etc.).
- Consolidating the same test shape across multiple files is a structural rewrite. Route it to ast-grep; ugrep matches text and cannot reach an AST-shape rewrite.

## Side Effects

| Effect        | Description                                     |
| ------------- | ----------------------------------------------- |
| File creation | Writes test files to the project test directory |

## Input

Receives symptom, repro, root_cause, and test_paths via the Agent spawn prompt. If symptom or repro is not passed, return `No repro provided`.

| Field      | Type     | Example                                              |
| ---------- | -------- | ---------------------------------------------------- |
| symptom    | string   | Passing an empty array yields NaN for the sum        |
| repro      | string   | Call sum([])                                         |
| root_cause | optional | reduce called without an initial value (from root cause analysis) |
| test_paths | optional | [tests/math/, tests/shared/]                         |

## Workflow

| Step | Action                                                  | Output                  | On dead-end                                     |
| ---- | ------------------------------------------------------- | ----------------------- | ----------------------------------------------- |
| 1    | Identify the reproduced behavior from symptom and repro | Target behavior         | No repro, return `No repro provided`            |
| 2    | Map the behavior to the Perspective Checklist           | behavior → perspectives | Map empty, ask user to clarify the symptom      |
| 3    | Detect test framework                                   | Framework name          | Undetected, fall back to vitest (JS/TS) or ask  |
| 4    | Check existing tests for the target behavior            | Skip decision           | Already covered, return "no work"               |
| 5    | Generate failing tests via TDD cycle                    | Test files written      | Generation fails, log and report partial result |
| 6    | Report summary                                          | Structured fields       | -                                               |

## Framework Detection

| Project marker | Framework default     |
| -------------- | --------------------- |
| package.json   | vitest / jest / mocha |
| Cargo.toml     | cargo test            |
| pyproject.toml | pytest                |
| go.mod         | go test               |

## Constraints

| Constraint            | Rationale                                                                   |
| --------------------- | --------------------------------------------------------------------------- |
| No implementation     | Never modify production code from this agent                                |
| TDD cycle             | Generate failing tests first, follow Red, Green, Refactor in order          |
| Perspective binding   | Each test cites its Perspective(s) before generation                        |
| Decision table first  | For 2+ conditions, write the decision table as a comment, then test per row |
| Project conventions   | Match existing test framework, naming, and directory structure              |
| Mock ≤ assertions     | Mock count must not exceed assertion count per test block                   |
| No heavy framework    | Use minimal framework appropriate to the case                               |
| No copy-paste         | Consolidate trivial variations into `test.each` or parameterized tests      |
| No non-target imports | UT may not import non-target production modules                             |

## Output

Return the following fields when the agent completes.

| Field       | Type   | Value                                                                               |
| ----------- | ------ | ----------------------------------------------------------------------------------- |
| summary     | object | created (count per unit / integration), skipped (each item is test type, reason)    |
| files       | list   | each item is path, tests (count), status (created / skipped)                        |
| coverage    | object | covered (behavior → test file:test name), uncovered (each item is behavior, reason) |
| suggestions | list   | additional edge cases derived from the repro steps                                  |
