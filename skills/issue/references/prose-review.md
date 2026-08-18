# Prose Review

Write for a teammate who shares context and can open the linked docs. The issue carries the delta; links carry the background. Do not write a line whose removal would not mislead the reader. What this file checks is the structure specific to an issue body, not the wording or the shape of its sentences.

## Structure

| Check          | Question                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Problem stated | Is the problem or request in 1-3 lines at the top?                                                                                    |
| Concreteness   | Bug: are reproduction steps concrete? Feature: is the use case concrete? Is the expected outcome not left to inference?               |
| Delta focus    | Does it skip what the code shows and stay on why and done conditions? What does not fit gets cut, or moved to another issue or a link |
| Section fit    | Does each section carry only what its heading asks?                                                                                   |

## Redundancy patterns

Fix redundancy of the same nature even when the table below does not name it.

| Pattern           | Fix                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Doc transcription | Fold restated linked docs or logs into link + one-line takeaway; write only the delta                                    |
| Repeated decision | State the same design reason once, where the decision lands. Option comparisons stay out of the body and belong to think |
| Over-specified AC | Keep the criterion, drop authoring details such as story names and enumerated config values                              |
