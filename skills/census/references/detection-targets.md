# /census detection targets

Phase 2 scans file patterns. Phase 3 commit-message mining and Phase 4 document-prose extraction scan decision verbs.

## Filename patterns

| Filename pattern                                                     | Likely content                       |
| -------------------------------------------------------------------- | ------------------------------------ |
| `README.md`                                                          | Design intent, naming, prohibitions  |
| `CONTRIBUTING.md`                                                    | Code style decisions, workflow rules |
| `SECURITY.md`                                                        | Threat boundaries, security policies |
| `THREAT_MODEL.md`                                                    | Trust boundaries, mitigations        |
| `ARCHITECTURE.md`                                                    | Module decomposition, layer policy   |
| `DESIGN.md` / `*.design.md`                                          | Component rationale                  |
| `CLAUDE.md` / `AGENTS.md`                                            | AI-agent operating decisions         |
| `Makefile` / `justfile`                                              | Build flow decisions                 |
| Linter config (`Cargo.toml` `[lints.*]`, `.eslintrc`, `oxlint.json`) | Rule selection rationale             |

## Decision verbs

| Type   | English                     | Japanese             |
| ------ | --------------------------- | -------------------- |
| Select | `decide` `choose` `adopt`   | `決定` `採用` `選定` |
| Reject | `reject` `deprecate`        | `禁止` `排除`        |
| Oblige | `must not` `never` `always` | `方針` `従う` `規約` |
