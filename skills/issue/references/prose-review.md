# Prose Review

Write for a teammate who shares the context and can open the linked docs. Put only the delta in the issue body and leave the background to the links. Write only a line that changes what the reader decides. This review checks the structure of an issue body alone.

## Structure

| Check          | Question                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Problem stated | Do the first 1-3 lines state the problem or the request?                                                                                                 |
| Concreteness   | For a bug, are the reproduction steps concrete? For a feature, is the use case concrete? Is the expected result left to the reader's inference?          |
| Delta focus    | Does it drop what the code already shows and stay on the why and the done conditions? Is what does not fit deleted, or moved to another issue or a link? |
| Section fit    | Does each section carry only what its heading asks for?                                                                                                  |
| Guesswork      | Is every statement a decision someone made or a fact someone verified? Settle a guess via AskUserQuestion or Read before writing it                      |

## Redundancy patterns

Fix redundancy of the same nature even when the table below does not name it.

| Pattern           | Fix                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Doc transcription | Do not restate a linked doc or log. Fold it into the link plus a one-line takeaway, and write only the delta                   |
| Repeated decision | State the same design reason once, where that decision lands. Keep option comparisons out of the body. They belong to `/think` |
| Over-specified AC | Keep the criterion and drop directions on how to write it, such as story names and enumerated config values                    |
