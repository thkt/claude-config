# Prose

Write software-development prose with words whose baseline the reader can reconstruct and sentences whose role the reader can predict. Applies to test descriptions, Issue/PR bodies, commit messages, plans, code comments, and technical docs. Before finalizing, reread the output and concretize any term whose baseline a reader could not reconstruct, whether or not it appears in the tables below.

## Define Concretely

The right column lists examples, not limited to these. The next section's table works the same way. Rewrite any word that causes the same problem into that row's target form.

| Target form                                                        | Words to rewrite                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| State the condition and the expected result                        | 正しく / 正常 / 異常 / correct / normal / abnormal                                   |
| State the default value or the precondition                        | 通常 / 一般的 / 標準的 / usual / ordinary / standard / general                       |
| State the concrete value or behavior                               | 期待値 / 意図どおり / 仕様どおり / as intended / as specified                        |
| Name the actual operation, such as transform, validate, or persist | 処理する / 処理 / process                                                            |
| Name the contents, such as user name or order list                 | データ / 情報 / data / information                                                   |
| List the conditions you verified                                   | 問題なく / without issues                                                            |
| State the concrete operation and its criteria                      | 適切に / きちんと / appropriately / properly                                         |
| State the concrete property or operation                           | 堅牢 / 活用する / 掘り下げる / robust / leverage / delve                             |
| Use verbs naming the real operation and result                     | Abstract verbs such as 効く / 重ねる / 支える / works / layers / supports            |
| Restore the phrase with particles and verbs                        | Compressed nouns such as 変更影響 / 文脈保持. Established technical terms stay as is |
| Drop the phrase and state what it refers to                        | Literal translation of another language's idiom. Established phrases stay as is      |

## State Comparison Baseline

| Target form                                  | Words to rewrite                          |
| -------------------------------------------- | ----------------------------------------- |
| State the concrete number or threshold       | 大量 / 少量 / large amount / small amount |
| State the concrete size or comparison target | 大きい / 小さい / large / small           |
| State the scope and the sort key             | 最新 / 最古 / latest / oldest             |
| State the measured value and the threshold   | 速い / 遅い / fast / slow                 |

## State Scope Explicitly

Models do not generalize an instruction from one item to another, nor do they infer scope you did not state. Therefore, when authoring a rule, spec, or prompt, write the intended scope into the text.

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
| Negation after the premise  | State the content directly. When negating, first give the reason the reader would assume X                                                                           |
| Resolve raised questions    | After stating a problem, give its cause or handling; after stating an operation, give its result in the next sentence, then move on                                  |
| Connect with demonstratives | When the referent is unique in the previous sentence, receive it with "that" to signal continuation. When candidates are plural, rewrite the noun                    |
| Keep the subject            | Put a subject on any sentence where whose judgment or what action changes                                                                                            |
| Write the action            | Make the actual action the predicate for a program, file, or test. Write "the formatter duplicates the row", not "the formatter dislikes it"                         |
| State the real condition    | Replace alive / dead / surviving with the actual condition. Write "the hook does not fire", not "the hook is dead". Established terms such as dead code are excepted |
| Shift the temperature       | End problem sentences so the burden shows (cannot, must), and post-improvement sentences so the relief shows (becomes able to)                                       |
| Start from the content      | Start directly from what you want to convey. Do not stage it with "the essence is" or "the only key is"                                                              |

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
