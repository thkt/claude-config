# Plan Template

`/think` generates the Phase 3 draft `.claude/workspace/planning/YYYY-MM-DD-<slug>.plan.md` from this skeleton. `/issue` transfers the `## Plan` and `## Backlog candidates` sections verbatim into the issue's Plan section.

## Template

`{...}` is replaced with content at generation. The draft consists of exactly these 2 sections; keep the headings and bullet shapes intact. The build workflow maps the Plan section into build.js's EXTRACT_SCHEMA via LLM extraction, and stops omissions and fabrications with a deterministic cross-check of the U-NNN / T-NNN id sets. Break the skeleton and that extraction breaks with it. No hidden machine block.

```markdown
## Plan

Outcome: {one line describing the done state; implementation-independent, observable}
root_cause: {required only when the issue title carries a [Bug] prefix; the underlying cause, not just the symptom. Omit the line for a non-Bug issue}
test_command: {one-line test command, e.g. cargo test / node --test tests/}
base: {branch the plan is implemented against (PR base); current checkout's branch when nothing names one}
reference_module: {kind + reason as an object (kind: module/no-module/new-shape); module also carries path below}

### Reference module

{Omit the whole subsection when kind is not module.}

- instances: {how many existing features already share this shape; say "Nth instance" when 2 or more}
- files: {each file to replicate, with its role (`src/foo/list.tsx` list screen)}
- conventions: {shared conventions later units must keep (composed components, where formatting lives, how state is passed)}

### Preconditions

- {existing dependency, as path only or path + stable anchor (`src/storage/mod.rs` `open_db`)}

### U-001 {unit title}

{One declarative goal line. The behavior this unit delivers}

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

A cap counts physical lines, not sentences. Extraction matches headings and ids without reading sentence boundaries, so once Outcome or a goal carries 3 or more clauses, split it into 2 sentences on the same line. Packed into one sentence, the qualifiers stack up ahead of the head noun and the reader reaches the predicate before learning what the subject is. For example, `fixed that the fix stage self-reported gets classified as resolved / reopened by the post-fix diff rejudge, and reopened surfaces in the workflow result` packs 3 clauses into one sentence. Split it into `an item the fix stage self-reported as fixed is classified resolved or reopened by the post-fix diff rejudge. reopened surfaces in the workflow result`. A T-NNN stays one sentence, since it is used verbatim as a test name.

| Field         | OK                                                   | NG                                      |
| ------------- | ---------------------------------------------------- | --------------------------------------- |
| Outcome       | Search results render within 1 second                | Make search fast (not observable)       |
| Preconditions | `src/config.rs` `load_config`                        | A comment string inside src/config.rs   |
| contract      | Follow `search` in `src/query.rs`; add a limit param | Write out a new-signature code fragment |
| T-NNN         | An empty query returns an error                      | Verify it works correctly               |
