# Conditional investigation tactics

Referenced from /research Phase 4. Holds the tactics read only when their trigger applies. Source notation and Domain scoping are used on every run, so the SKILL.md body keeps them.

## Tracing execution paths (Feature planning or Bug investigation)

SKILL.md Phase 4 owns the explorer-feature trigger and return shape; this section decides only how to trace. Feature planning traces the prospective path, Bug investigation the failing path. Include the research subject title verbatim in the spawn prompt. If it returns empty, re-run with broader keywords.

## codegraph first (when a .codegraph/ index exists)

In a repo holding a `.codegraph/` index, refresh it with `codegraph sync` and resolve structural questions with codegraph first. Get callers with `codegraph callers <symbol>` and the blast radius plus affected tests with `codegraph impact <symbol>`, and cite that output as the finding's source. A ugrep / grep search for the symbol name is not accepted as a source for the same questions. In a repo without the index, do not init unprompted; fall back to Explore / ugrep, and use ugrep / grep only for free-text content search.
