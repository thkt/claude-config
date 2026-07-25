# Principles

## Priority Matrix

| Priority   | Principle                               |
| ---------- | --------------------------------------- |
| Foundation | Outcome-driven                          |
| Foundation | Backcasting                             |
| Critical   | Occam's Razor                           |
| Critical   | Progressive Enhancement                 |
| Critical   | Systems Thinking                        |
| Default    | Readable Code                           |
| Default    | Miller's Law                            |
| Default    | TDD / Baby Steps                        |
| Default    | DRY                                     |
| Default    | Single Source of Truth                  |
| Default    | YAGNI Boundary                          |
| Default    | Reuse Ordering                          |
| Default    | Strong Inference                        |
| Default    | Measurement                             |
| Contextual | SOLID                                   |
| Contextual | Container / Presentational              |
| Contextual | Law of Demeter                          |
| Contextual | AI-Assisted Development (Overeagerness) |
| Contextual | TIDYINGS                                |

## Triggers

| Trigger                                                 | Principle               |
| ------------------------------------------------------- | ----------------------- |
| New task or unclear goal                                | Backcasting             |
| Method chains >2                                        | Law of Demeter          |
| Shrank code into obfuscation                            | Readable Code           |
| Complex-first                                           | Occam's Razor           |
| Started Resilient / Fast / Flexible before Work         | Progressive Enhancement |
| Single hypothesis                                       | Strong Inference        |
| Two failed fixes under the same assumption              | Strong Inference        |
| Local improvement leaves the whole flat or worse        | Systems Thinking        |
| Fix for the same symptom recurs                         | Systems Thinking        |
| Coordinated call sites >= 2                             | YAGNI Boundary          |
| About to create, or found, a copy of the same knowledge | Single Source of Truth  |
| Before new code or a new dep                            | Reuse Ordering          |
| Post-write verbose                                      | Occam's Razor           |
| Extra files or unasked scope                            | Overeagerness           |

## Conflict Resolution

- Outcome-driven defines the why, Backcasting the goal, and the other principles the path.
- Systems Thinking sets the scope to optimize (the whole system that carries the outcome), and Occam's Razor picks the simplest approach within that scope.
- When in doubt, simple > clever, concrete > abstract, working > perfect, readable > DRY.
- Occam's Razor does not count temporary symptom relief as an achievement, and picks only the simplest approach that does not degrade the output quality directly tied to outcome achievement.
