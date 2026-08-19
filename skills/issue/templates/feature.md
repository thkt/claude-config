# Feature Template

When /issue classifies the request as feature, it generates the title and body from this skeleton.

## Template

`{...}` is replaced with content at generation. Sections marked `(optional)` are omitted, heading and all, when there is nothing to say.

```markdown
## What & Why

{What to build - 1-2 sentences}
{Why it's needed - user problem or business reason}

## Acceptance Criteria

- [ ] {When X, then Y happens}
- [ ] {When X, then Y happens}

## Scope

- In scope: {What this issue covers}
- Out of scope: {What this issue explicitly excludes}

## Accessibility (optional)

- {UI-touching issues only. Expected input modes and the criteria to meet: "all operations complete with keyboard only" / "errors are announced to screen readers via aria-live"}
- {Why the chosen direction (optional): "use native <dialog>; focus management comes standard"}

## Approach (optional)

- {An implementation direction that cleared critic-design: "place under OrderService to match existing structure". One nothing attacked goes to `/think` rather than here}

## Constraints (optional)

- {Technical constraints, prohibited approaches, dependencies}

## Testing Decisions

- {Definition of "good" for this issue: external behavior only, not implementation details}
- {Modules under test: which module/component/function gets tested}
- {Prior art: link or filename for the most similar existing test}
- {Skip rationale (optional): if no test is added, state why explicitly}
```

## Guidelines

| Field               | OK                                                   | NG                                                       |
| ------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| What & Why          | Add CSV export so users can analyze offline          | Add CSV export (no Why)                                  |
| Acceptance Criteria | When user clicks Export, a .csv downloads            | CSV export works correctly                               |
| Scope - Out of      | Excel format is out of scope                         | (omitted)                                                |
| Accessibility       | All operations complete with keyboard only           | Omitted despite UI changes, or bare "make it accessible" |
| Approach            | Match the OrderService structure                     | A direction nothing attacked                             |
| Constraints         | Must not add new dependencies                        | (omitted when there are known constraints)               |
| Testing Decisions   | Test the CSV serializer; mirror tests/orders.test.ts | TBD or skipped without rationale                         |
