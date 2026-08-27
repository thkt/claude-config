# アブレーションレポートの骨格

`/ablate` の `${CLAUDE_SKILL_DIR}/scripts/report.py` の `_render` が出す節の骨格。どの節がどの順で現れるかを持つ。各表の列と Summary の行ラベルは `_render` 内の `_table` 呼び出しが持つため、このファイルはどちらも書かない。ここへ複製すると、`_render` が次に列を足した時点で古くなり、それを捕まえるものが無い。

削除候補が 1 件も無いとき、`_render` はその節の一覧の代わりに `No delete candidates.` と書く。

## 骨格

```markdown
# Ablation Report

## Summary

<_render が数える指標ごとに 1 行>

## Always-Loaded Elements

<enforcer_map が分類した行ごとに 1 行>

## Harness Elements

<harness_elements が列挙した要素ごとに 1 行>

## Arms

<アームごとに 1 項目>

## Verdicts

<観測した要素ごとに 1 行>

## Delete Candidates

<残った候補ごとに 1 項目>
```
