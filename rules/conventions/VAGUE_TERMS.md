# Vague Terms

Applies to test descriptions, Issue / PR bodies, commit messages, plans, code comments, and technical docs. Specify ambiguous software-development terms before use.

The tables below are a quick reference, not an exhaustive list. Before finalizing, reread the output and concretize any term whose baseline a reader could not reconstruct, whether or not it appears below.

## Define Concretely

| Banned term                                 | Problem                     | Replace with                       |
| ------------------------------------------- | --------------------------- | ---------------------------------- |
| correct / normal / abnormal                 | No baseline                 | Condition and expected result      |
| usual / ordinary / standard / general       | Whose usual?                | Default value or precondition      |
| expected value / as intended / as specified | Empty reference             | Concrete value or behavior         |
| process (noun / verb)                       | What operation?             | Transform, validate, persist, etc. |
| data / information                          | What data?                  | User name, order list, etc.        |
| without issues                              | What was actually checked?  | List verified conditions           |
| appropriately / properly                    | What counts as appropriate? | Concrete operation and criteria    |
| robust / leverage / delve                   | What improves, and how?     | Concrete property or operation     |

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

## Delete Document-Updating Sentences

Judge each sentence by what it updates: the situation (facts about the subject, judgments, confidence) or the document (how the document itself looks or proceeds). Delete a sentence that only updates the document. Typical forms that slip into AI-generated bodies are the three below (not limited to these).

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
