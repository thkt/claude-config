# /census decision criteria

Used by Phase 4 tagging / ranking / `critic-design` challenge. Passed whole to `critic-design` in Phase 4 Step 2.

## incomplete-contract

A finding is `incomplete-contract` when code carries a comment stating what is true but not what must remain true. It relies on the reader inferring "and this should stay this way." Security invariants and design rationale carry it often. For example, an SSRF-safe HTTP client field is annotated "redirect disabled for SSRF". Nothing states the rule "future commands handling externally supplied URLs MUST use this client", so the finding stands.

The missing forward-looking rule cannot be read off the code, so it is lost unless someone writes it down. Promote such a finding regardless of `documented?` value. Whether a DR or a stronger comment supplies it is for the challenge to decide.

## DR-worth rule of thumb

Reserve DR for the two categories below, where no tool can hold the line. Lint config, the type system, and automated tests reject a mechanical violation as it happens, while DR text holds only when someone reads it.

| Category                           | Example                                                         |
| ---------------------------------- | --------------------------------------------------------------- |
| An invariant no tool can enforce   | "field X must not be used with Y" when both carry the same type |
| A public API compatibility promise | An exit code convention, a JSON output schema                   |

## A statement-of-fact config is not a DR

A statement-of-fact config (`deny.toml`, `Cargo.toml`) is itself the single source of truth, and copying it into a DR lets the two drift apart. Write that policy as a 1-2 line comment in the config block.

## impact + reversibility criteria

| Impact | Criteria                                                              |
| ------ | --------------------------------------------------------------------- |
| H      | Crosses module boundary, affects public API, or governs 2+ subsystems |
| M      | Affects single module's internal contract                             |
| L      | Local style or naming choice                                          |

| Reversibility | Criteria                                                         |
| ------------- | ---------------------------------------------------------------- |
| high          | Decision can be reversed by editing one location                 |
| medium        | Reversal requires coordinated changes across 2-5 files           |
| low           | Reversal requires migration, deprecation cycle, or schema change |

## Devil's Advocate challenge angles

`critic-design` challenges each initial promotion candidate with the following.

- Does a future contributor actually benefit from the rule? Who is the reader?
- Does a non-DR mechanism already cover it: comment + test, statement-of-fact config, type system, lint? Then the DR is redundant.
- Does the DR risk lock-in? Over-documenting a decision that should evolve locks it in.
- For monolithic-boundary candidates, would the DR justify the status quo and reduce pressure to split?
- Bug or invariant. If the current code is wrong and should change, surface it as a bug-fix follow-up, not a DR. If the current code is intentional and should be preserved, consider the DR. Never document wrong behavior as intentional.

## Verdict

Only `keep` and `downgrade` with its target DR named become DRs. `drop` becomes no DR, and the verdict still lands in the report.

| Verdict     | Meaning                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| `keep`      | DR worth, file as standalone or merge with related candidates                                                        |
| `downgrade` | Not standalone DR; absorb into a related DR section or strengthen comments                                           |
| `drop`      | Not DR-worthy; config / comment / test already covers it, cost exceeds value, or a bug routed to a bug-fix follow-up |
