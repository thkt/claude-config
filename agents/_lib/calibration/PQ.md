# PQ (reviewer-prompt)

## REPORT

```markdown
When you encounter a situation where the user has provided input that needs to be validated, you should first check whether the input conforms to the expected format.
If it does not conform, you should return an appropriate error message.
If it does conform, you should proceed with processing the input according to the rules defined below.
```

| Field   | Value                                           |
| ------- | ----------------------------------------------- |
| Filter  | Harm Test pass - 4 lines of prose = 1 table row |
| Trigger | LLM reads ~60 tokens for a 2-column rule        |
| Impact  | Equivalent 2-column table row saves 50+ tokens  |

## SKIP

```markdown
This reviewer detects silent failures - errors that are caught but not surfaced to the user or logged for operators.
```

| Field  | Value                                                         |
| ------ | ------------------------------------------------------------- |
| Filter | Context Test: 2-line intro before detailed table              |
| Signal | Brief context-setting prose; converting to table adds nothing |
