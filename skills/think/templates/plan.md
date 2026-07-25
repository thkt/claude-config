# Plan Template

`/think` generates the Phase 3 draft `.claude/workspace/planning/YYYY-MM-DD-<slug>.plan.md` from this skeleton. `/issue` transfers both sections verbatim into the issue's Plan section.

## Template

`{...}` is replaced with content at generation. The draft consists of exactly these 2 sections; keep the headings and bullet shapes intact. The build workflow maps the Plan section into build.js's EXTRACT_SCHEMA via LLM extraction and stops omissions and fabrications with a deterministic cross-check of the U-NNN / T-NNN id sets, so extraction stability rests on skeleton stability. No hidden machine block.

```markdown
## Plan

Outcome: {one line describing the done state; implementation-independent, observable}
test_command: {one-line test command, e.g. cargo test / node --test tests/}
base: {branch the plan is implemented against (PR base); current checkout's branch when nothing names one}
reference_module: {module root of the existing same-shaped module, or null + why this shape is new}

### Reference module

{Omit the whole subsection when reference_module is null.}

- instances: {how many existing features already share this shape; say "Nth instance" when 2 or more}
- files: {each file to replicate, with its role: `src/foo/list.tsx` list screen}
- conventions: {shared conventions later units must keep: composed components, where formatting lives, how state is passed}

### Preconditions

- {existing dependency, as path only or path + stable anchor: `src/storage/mod.rs` `open_db`}

### U-001 {unit title}

{One declarative goal line: the behavior this unit delivers}

- files: {`src/foo.rs`, `tests/foo.test.rs`}
- contract: {one citation line + one intent line}
- seam: {true only on the seam unit; omit the line on every other unit}

Acceptance tests.

- T-001 {one-line statement of condition + expected result; becomes the test name}

## Backlog candidates

- {candidate to carve out of scope, one line each}
```

## Guidelines

List units in implementation order. Among units whose implementation order is not forced by dependencies, place those carrying tweak-prone decisions such as data models, type interfaces, and UX flows first, and purely mechanical ones last. Review attention reaches the decisions most likely to change first, and a reversed decision costs less rework. Each field's cap is the line count shown in the skeleton; resolve overflow by splitting, not by adding prose. Divide the unit, or carve out to backlog. A unit with no verifiable behavior (docs / config) omits the whole "Acceptance tests." block. The semantics of id numbering, the seam unit, and how build treats units without tests live in SKILL.md Phase 3.

| Field         | OK                                                   | NG                                      |
| ------------- | ---------------------------------------------------- | --------------------------------------- |
| Outcome       | Search results render within 1 second                | Make search fast (not observable)       |
| Preconditions | `src/config.rs` `load_config`                        | A comment string inside src/config.rs   |
| contract      | Follow `search` in `src/query.rs`; add a limit param | Write out a new-signature code fragment |
| T-NNN         | An empty query returns an error                      | Verify it works correctly               |
