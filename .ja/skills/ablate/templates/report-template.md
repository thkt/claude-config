# Ablation Report テンプレート

`/ablate` の `${CLAUDE_SKILL_DIR}/scripts/report.py` の `_render` が出力する骨格。各テーブルの列定義は
`_render` 内の `_table` 呼び出しが持ち、ここには重ねて書かない。ヘッダーと順序については `_render` を読む。

`_render` が delete candidates を検出しないとき、そのセクションに `No delete candidates.` と書く。

## Template

以下の 4 つのテーブルセクション (Summary、Always-Loaded Elements、Harness Elements、Verdicts) は各 1 回生成される。`{...}` はレポートデータで置き換える。

```markdown
# Ablation Report

## Summary

| Metric                        | Value |
| ----------------------------- | ----- |
| Harness elements enumerated   | {N}   |
| Arms                          | {N}   |
| Elements observed             | {N}   |
| Delete candidates             | {N}   |
| Always-loaded lines mapped    | {N}   |
| Held by a live DR             | {N}   |

## Always-Loaded Elements

| File      | Line | Verdict | Enforcer |
| --------- | ---- | ------- | -------- |
| {file}    | {N}  | {verb}  | {name}   |

## Harness Elements

| Path   | Classification |
| ------ | -------------- |
| {path} | {class}        |

## Arms

- {arm}

## Verdicts

| Path   | Verdict |
| ------ | ------- |
| {path} | {verb}  |

## Delete Candidates

- {path}
```
