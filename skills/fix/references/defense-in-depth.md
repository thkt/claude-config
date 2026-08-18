# Defense-in-Depth Validation

Add checks at every layer the failure could pass through, so different code paths or refactors cannot reopen the same bug.

## When to Apply

Driven by the Pattern field `use-context-root-cause-analysis` returns. What each value means is defined in that skill's Pattern Enum.

| Pattern    | Action                                                       |
| ---------- | ------------------------------------------------------------ |
| Isolated   | Skip                                                         |
| Recurring  | Apply layers 1-2 (entry point and business logic) at minimum |
| Systematic | Apply every layer and escalate to `/research`                |

## Layers

Of the layers the Pattern selected, add only those whose condition holds.

| Layer | Type                  | Purpose               | Applies when                        | Example                              |
| ----- | --------------------- | --------------------- | ----------------------------------- | ------------------------------------ |
| 1     | Entry point           | Reject invalid input  | External input is involved          | Throw if required param is empty     |
| 2     | Business logic        | Hold the invariant    | Domain invariants can be violated   | Validate entity state after mutation |
| 3     | Environment guards    | Catch a wrong context | Ops have environment-dependent risk | Refuse destructive ops in test env   |
| 4     | Debug instrumentation | Forensics             | Failure is hard to reproduce        | Log with stack trace before risky op |

## Applying the Pattern

1. Trace data flow from where the bad value originates to where it is consumed
2. Map all checkpoints data passes through
3. Select layers by Pattern. The mapping is in § When to Apply
4. Add validation at each selected layer
5. Test each layer independently by bypassing one and confirming another catches it

## Verification

- [ ] Pattern drove layer selection
- [ ] Each layer is independently testable
- [ ] Bypass test ran for at least one layer (Systematic path)
