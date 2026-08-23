# Prose

Write software-development prose with words whose baseline the reader can reconstruct and sentences whose role the reader can predict. Applies to test descriptions, Issue/PR bodies, commit messages, plans, code comments, and technical docs. Before finalizing, reread the output and concretize any term whose baseline a reader could not reconstruct, whether or not it appears in the table below.

## Define Concretely

The right column lists examples, not limited to these.

| Target form                                                        | Words to rewrite                                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| State the condition and the expected result                        | 正しく / 正常 / 異常 / correct / normal / abnormal                                                          |
| State the default value or the precondition                        | 通常 / 一般的 / 標準的 / usual / ordinary / standard / general                                              |
| State the concrete value or behavior                               | 期待値 / 意図どおり / 仕様どおり / as intended / as specified                                               |
| Name the actual operation, such as transform, validate, or persist | 処理する / 処理 / process                                                                                   |
| Name the contents, such as user name or order list                 | データ / 情報 / data / information                                                                          |
| List the conditions you verified                                   | 問題なく / without issues                                                                                   |
| State the concrete operation and its criteria                      | 適切に / きちんと / appropriately / properly                                                                |
| State the concrete property or operation                           | 堅牢 / 活用する / 掘り下げる / robust / leverage / delve                                                    |
| Use verbs naming the real operation and result                     | Abstract verbs such as 効く / 重ねる / 支える / works / layers / supports                                   |
| Restore the phrase with particles and verbs                        | Compressed nouns such as 変更影響 / 文脈保持. Established technical terms stay                              |
| Drop the phrase and state what it refers to                        | Literal translation of another language's idiom. Established phrases stay                                   |
| Use the target language's own word                                 | A foreign word in the prose that has a plain equivalent. Identifiers, code, commands, and proper nouns stay |
| State the concrete number or threshold                             | 大量 / 少量 / large amount / small amount                                                                   |
| State the concrete size or comparison target                       | 大きい / 小さい / large / small                                                                             |
| State the scope and the sort key                                   | 最新 / 最古 / latest / oldest                                                                               |
| State the measured value and the threshold                         | 速い / 遅い / fast / slow                                                                                   |

## Tie Each Sentence to the Subject

A sentence you can move to another subject unchanged is filler. Judge at the sentence level, not the word level. The pressure to make a sentence specific also pushes you to invent numbers and owners you have no material for.

| Sentence state                                          | Rewrite operation                                                                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Moves to another subject by swapping the subject's name | Replace it with a fact, example, mechanism, consequence, or judgment. Delete the sentence when you have no material for the replacement |
| No material at hand to make it specific                 | Do not invent numbers, dates, owners, outcomes, or failure modes. Name the missing material and surface it to the human                 |

## State Scope Explicitly

Models do not generalize an instruction from one item to another, nor do they infer scope you did not state. Write the intended scope into every rule, spec, and prompt.

| Intent               | Write                                    |
| -------------------- | ---------------------------------------- |
| List is illustrative | "such as A, B, C (not limited to these)" |
| List is exhaustive   | "exactly these: A, B, C"                 |
| Apply broadly        | "every section, not just the first"      |

## Mark What Is Central

Do the extraction the reader would otherwise have to do.

| Rule                            | Directive                                                                                                                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Length ceilings                 | Cap a sentence at 25 words and a paragraph at 150. Split at subject-predicate pairs, or turn it into a table or list. A verbatim element the writer cannot shorten, such as a path, a command, an identifier, or a file:line, does not count toward the length |
| Lead with the center            | Put the section's most important claim in its first sentence. Do not make the reader extract the point                                                                                                                                                         |
| Emphasize only the center       | Emphasize the central claim alone. Emphasizing several places leaves the reader unable to tell which one is central                                                                                                                                            |
| No forward references           | Do not write "as described below" or "see below for details". Write it in place, or move it behind a link                                                                                                                                                      |
| Split condition from conclusion | Do not put a condition and a conclusion in one sentence. Write the conclusion first and the condition in the next sentence                                                                                                                                     |
| One claim per sentence          | Do not pack a decision, its rationale, and its references into one sentence or one paragraph. Cut the sentence where the claim changes                                                                                                                         |
| No nested clauses               | Do not nest clauses. Split into short affirmative sentences                                                                                                                                                                                                    |
| One action per step line        | Write each step as one sentence, and start each line with a verb                                                                                                                                                                                               |
| No return trips to the body     | Write each table row so it reads on its own                                                                                                                                                                                                                    |
| Intent, operation, judgment     | Do not mix the three in one section. Put the operation in steps and the judgment in a condition-and-treatment table, and lead with the intent in one sentence                                                                                                  |

## Let the Reader Predict the Next Sentence

Do not leave the relation between sentences to the reader's guess; show it at the head and the end of each sentence.

| Rule                         | Directive                                                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Announce with connectives    | A sentence turning to contrast, concession, causation, or an example announces its role with a leading connective (in contrast, therefore, for example)                           |
| Negation after the premise   | State the content directly. Avoid double negatives, and when negating, first give the reason the reader would assume X                                                            |
| Prohibition with replacement | Do not stop at "do not write X". Give the replacing operation on the same row or in the next sentence. A detection table pairing the pattern with a Fix column already meets this |
| Resolve raised questions     | After stating a problem, give its cause or handling in the next sentence. After stating an operation, give its result in the next sentence. Then move on                          |
| Connect with demonstratives  | When the referent is unique in the previous sentence, receive it with "that"; when candidates are plural, rewrite the noun. Never give one referent several names                 |
| Keep the subject             | Put a subject on any sentence where whose judgment or what action changes                                                                                                         |
| Write the action             | Make the actual action the predicate for a program, file, or test. Write "the formatter duplicates the row", not "the formatter dislikes it"                                      |
| State the real condition     | Replace alive / dead / surviving with the actual condition. Write "the hook does not fire", not "the hook is dead". Established terms such as dead code are excepted              |
| Shift the temperature        | End problem sentences so the burden shows (cannot, must), and post-improvement sentences so the relief shows (becomes able to)                                                    |
| Start from the content       | Start directly from what you want to convey. Do not stage it with "the essence is" or "the only key is"                                                                           |

## Decide Before Writing

Writing without a decided job lets the headings of the nearest existing document become the structure, and an unfamiliar form reads as difficult content. This applies to documents that have no template; DR, Issue, plan, OUTCOME, commit messages, test descriptions, and code comments are out of scope. Documents that ask the reader neither to decide nor to act (OUTCOME, reference tables, glossaries) are out of scope for the form judgment.

| Decide                    | Directive                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Job                       | State in one sentence what this document makes hold, and put it at the top of the body. When there are two, split the document     |
| Reader                    | Who reads it, and what they already know. Keep it out of the body, and let it set where the explanation starts and what is skipped |
| Speaker                   | Whose voice writes it. Keep it out of the body, and let it set the subject, the politeness, and the strength of assertion          |
| The form's source         | Take it in this order: template > established format > cognitive sequence. A sibling is not a source                               |
| Judging a sibling         | When a sibling's sections do not map to notice, understand, decide, act, confirm, do not copy them                                 |
| Borrow the form only      | Borrow section order and section names only. Do not copy wording, or anything violating another section of this file               |
| Deviations carry a reason | When departing from the existing form, write the reason in the document. If you cannot, restore the form                           |

## Delete the Excess

Delete a sentence a reader can already read off the adjacent code, table, or heading, and one that only updates how the document itself looks or proceeds. Delete an instruction to the writer that arrived with the source material. Take the section length that covers the substance. Keep a sentence when the deleting side cannot state why it is there. Conditions, exceptions, and failure behavior are not redundancy, so do not drop them to make the text shorter. Typical forms below (not limited to these).

| Form                   | Description                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Progress narration     | Announcing in place what the document is about to say or do                                                                                 |
| Self-characterization  | Declaring the document's own scope or nature                                                                                                |
| Stance-free disclaimer | Adding a supplement without naming the misreading it rejects                                                                                |
| Revision narration     | Stating the earlier wording or the overturned premise                                                                                       |
| Reprinted brief        | An instruction to the writer that arrived with the source material, such as "keep the original texture". Obey it and leave the sentence out |
| Code restatement       | Prose repeating what the code directly below states                                                                                         |
| Consequence narration  | Stating what an instruction or branch leads to. Keep the instruction alone                                                                  |
| Measurement provenance | Recording where a number came from or what was measured. It goes stale without changing behavior                                            |
| Filler section         | Built only from restatement of other sections or generalities. Removing it leaves the claims unchanged                                      |
| Redundant summary      | Re-stating at the end what the body already said                                                                                            |
| Boilerplate frame      | Placed to fill a template, carrying nothing specific to this document                                                                       |
| Hedge stacking         | Two or more hedges in one sentence, such as "might potentially" or "could possibly"                                                         |
| Filler phrase          | A pleasantry aimed at the reader, such as "Looking forward to your thoughts"                                                                |
