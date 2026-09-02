# PQ (reviewer-prompt)

## REPORT

```markdown
When you encounter a situation where the user has provided input that needs to be validated, you should first check whether the input conforms to the expected format.
If it does not conform, you should return an appropriate error message.
If it does conform, you should proceed with processing the input according to the rules defined below.
```

| Field   | Value                                  |
| ------- | -------------------------------------- |
| Filter  | Harm Test pass: 4 行の散文 = 1 表行    |
| Trigger | LLM が 2 列ルールに ~60 トークンを読む |
| Impact  | 等価な 2 列表行で 50+ トークン削減     |

## SKIP

```markdown
This reviewer detects silent failures - errors that are caught but not surfaced to the user or logged for operators.
```

| Field  | Value                                                  |
| ------ | ------------------------------------------------------ |
| Filter | Context Test: 詳細な表の前の 2 行イントロ              |
| Signal | 簡潔なコンテキスト設定散文; 表に変えても何も得られない |
