# Prose

Write software-development prose with words whose baseline the reader can reconstruct and sentences whose role the reader can predict. Applies to test descriptions, Issue / PR bodies, commit messages, plans, code comments, and technical docs. Before finalizing, reread the output and concretize any term whose baseline a reader could not reconstruct, whether or not it appears in the tables below.

## Define Concretely

| Banned term                                               | Problem                                                      | Replace with                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| correct / normal / abnormal                               | No baseline                                                  | Condition and expected result                                                  |
| usual / ordinary / standard / general                     | Whose usual?                                                 | Default value or precondition                                                  |
| expected value / as intended / as specified               | Empty reference                                              | Concrete value or behavior                                                     |
| process (noun / verb)                                     | What operation?                                              | Transform, validate, persist, etc.                                             |
| data / information                                        | What data?                                                   | User name, order list, etc.                                                    |
| without issues                                            | What was actually checked?                                   | List verified conditions                                                       |
| appropriately / properly                                  | What counts as appropriate?                                  | Concrete operation and criteria                                                |
| robust / leverage / delve                                 | What improves, and how?                                      | Concrete property or operation                                                 |
| Abstract verbs (works, layers, supports, etc.)            | Actual operation invisible                                   | Verbs naming the real operation and result                                     |
| Compressed nouns (change impact, context retention, etc.) | Missing particles and verbs hide the relation between words  | Phrase restored with particles and verbs. Established technical terms excepted |
| Literal translation of another language's idiom           | Does not read to someone who does not know the source phrase | Drop the phrase and state what it refers to. Established phrases excepted      |

## State Comparison Baseline

| Banned term          | Problem       | Replace with                       |
| -------------------- | ------------- | ---------------------------------- |
| large / small amount | No threshold  | Concrete number or threshold       |
| large / small (size) | No baseline   | Concrete size or comparison target |
| latest / oldest      | Scope unclear | Scope and sort key                 |
| fast / slow          | No threshold  | Measured value and threshold       |

## State Scope Explicitly

Models do not generalize an instruction from one item to another, nor infer scope you did not state. When authoring a rule, spec, or prompt, make the intended scope explicit.

| Intent               | Write                                    |
| -------------------- | ---------------------------------------- |
| List is illustrative | "such as A, B, C (not limited to these)" |
| List is exhaustive   | "exactly these: A, B, C"                 |
| Apply broadly        | "every section, not just the first"      |

## Sentence and Paragraph Ceilings

The longer a sentence runs, the smaller the share of it a reader understands. Cap a sentence at 25 words; when it goes over, split at subject-predicate pairs. Cap a paragraph at 150 words; when it goes over, split it or turn it into a table or list.

## Predictable Prose

Write so the reader can predict the next sentence's role from the previous one. Do not leave the relation between sentences to the reader's guess; show it at the head and the end of each sentence.

| Rule                        | Directive                                                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Announce with connectives   | A sentence turning to contrast, concession, causation, or an example announces its role with a leading connective (in contrast, therefore, for example)              |
| Negation after the premise  | Drop the "not merely X" opener and state the content directly. When negating, first give the reason the reader would assume X                                        |
| Resolve raised questions    | After stating a problem, give its cause or handling; after stating an operation, give its result in the next sentence, then move on                                  |
| Connect with demonstratives | When the referent is unique in the previous sentence, receive it with "that" to signal continuation. When candidates are plural, rewrite the noun                    |
| Keep the subject            | Put a subject on any sentence where whose judgment or what action changes                                                                                            |
| No personification          | Do not make a program, file, or test the subject of emotion, perception, or intent. Write "the formatter duplicates the row", not "the formatter dislikes it"        |
| No life-or-death wording    | Replace alive / dead / surviving with the actual condition. Write "the hook does not fire", not "the hook is dead". Established terms such as dead code are excepted |
| Shift the temperature       | End problem sentences so the burden shows (cannot, must), and post-improvement sentences so the relief shows (becomes able to)                                       |
| No punch lines              | Drop the "the essence is" / "the only key is" staging and start directly from the content                                                                            |

## Match the Familiar Form

A reader judges difficulty from a document's appearance before reading it, and cannot tell where that difficulty comes from. An unfamiliar form therefore reads as difficult content. Documents that ask the reader neither to decide nor to act are out of scope for the judgment below. OUTCOME, reference tables, and glossaries fall here, among others.

| Rule                      | Directive                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Choose the form's source  | Take it in this order: template > established format > cognitive sequence. A sibling is not a source                 |
| Judge the sibling         | When a sibling's sections do not map to notice, understand, decide, act, confirm, do not copy them                   |
| Borrow the form only      | Borrow section order and section names only. Do not copy wording, or anything violating another section of this file |
| Deviations carry a reason | When departing from the existing form, write the reason in the document. If you cannot, restore the form             |

## Delete Document-Updating Sentences

Judge each sentence by what it updates: the situation or the document. The situation is facts about the subject, judgments, and confidence; the document is how it itself looks and proceeds. Delete a sentence that only updates the document. Typical forms that slip into AI-generated bodies are the three below (not limited to these).

| Form                   | Description                                                  |
| ---------------------- | ------------------------------------------------------------ |
| Progress narration     | Announcing in place what the document is about to say or do  |
| Self-characterization  | Declaring the document's own scope or nature                 |
| Stance-free disclaimer | Adding a supplement without naming the misreading it rejects |

## Delete Redundant Sentences

Delete a sentence a reader can already read off the adjacent code, table, or heading.

| Form                   | Description                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| Code restatement       | Prose repeating what the code directly below states                                              |
| Consequence narration  | Stating what an instruction or branch leads to. Keep the instruction alone                       |
| Measurement provenance | Recording where a number came from or what was measured. It goes stale without changing behavior |

## Match Document Length to Content

The previous two sections delete by sentence. This one judges by section. Take the length that covers the substance, and do not add sections that only add bulk. Typical padding forms are the three below (not limited to these).

| Form              | Description                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Filler section    | Built only from restatement of other sections or generalities. Removing it leaves the document's claims unchanged |
| Redundant summary | Re-stating at the end what the body already said                                                                  |
| Boilerplate frame | Placed to fill a template, carrying nothing specific to this document                                             |
