# Branch naming

Assemble a new branch's name as `<type>/<scope>-<description>`. Both `/checkout` cutting one by hand and build cutting one in its Branch phase follow this. When one of them names branches its own way, the repository ends up with two shapes.

## Assembly

- Lowercase and hyphen-separated. No spaces, underscores, or CamelCase
- Keep scope and description to 2-4 words, naming the target and the result rather than a vague word such as update
- Put a ticket id or issue number, when one is known, in the scope position. Names these rules build carry no date; a name another route builds, such as `scribe/<yyyymmdd-HHMMSS>`, is out of scope

## Deciding the type

Read the type off the changes. The table below decides the trigger for each.

| Prefix    | Purpose              | Trigger               |
| --------- | -------------------- | --------------------- |
| feat/     | New functionality    | New files, components |
| fix/      | Bug fixes            | Error corrections     |
| refactor/ | Code improvements    | Restructuring         |
| docs/     | Documentation        | .md files, README     |
| test/     | Test additions/fixes | Test files            |
| chore/    | Maintenance          | Dependencies, config  |
| perf/     | Performance          | Optimization, caching |
