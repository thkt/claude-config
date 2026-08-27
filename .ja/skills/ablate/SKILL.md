---
name: ablate
description: ハーネスの各要素を 1 つずつ外して走らせ、その要素が結果を動かしているかを判定する。動かしていない要素を削除候補として挙げる。
when_to_use: ablation, 片側アブレーション, ハーネス要素の効果測定, 削除候補の洗い出し, harness ablation, which rules actually matter
allowed-tools: Read Write LS Bash(python3:*) Bash(claude:*)
model: opus
argument-hint: "[要素のパス]"
---

# /ablate - ハーネスの片側アブレーション

## Input

`$ARGUMENTS` は測定対象を 1 つに絞る要素のパス。省略したときは Phase 1 が列挙した全要素を対象にする。

## 判定と閾値の所在

アームの一覧、1 アームあたりの実行回数、通過閾値はすべて `${CLAUDE_SKILL_DIR}/scripts/arms.py` の定数が持つ。分類の基準は `${CLAUDE_SKILL_DIR}/scripts/verdict.py` が持つ。この本文に数値を書き写さない (`docs/wiki/deterministic-script-judgment.md`)。

## Phase 1: 列挙

`skills/_lib/harness_elements.py` の `enumerate_elements(root)` を呼び、ハーネス要素とその分類を得る。`$ARGUMENTS` が要素のパスを指すときは、その 1 件だけを Phase 2 へ渡す。

```bash
python3 -c 'import sys; sys.path.insert(0, "skills/_lib"); import harness_elements, json; print(json.dumps(harness_elements.enumerate_elements(".")))'
```

## Phase 2: アーム実行

Phase 1 が返した要素それぞれについて、`arms.ARMS` の各アームで `arms.arm_command(arm, element)` が返す命令を組み、`arms.RUN_COUNT` 回実行する。各 run の結果から、その要素についての観測 1 件を組む。

| 状況                                     | 扱い                                                             |
| ---------------------------------------- | ---------------------------------------------------------------- |
| run 数が `arms.RUN_COUNT` に届かない     | `arms.measurement_status(runs)` が `unmeasured` を返すまま進める |
| `wiped+1` に渡す要素が決まらない         | `arm_command` が ValueError で止まるので、要素を確定してから呼ぶ |
| 実行が失敗し結果を読めない run がある    | その run を数えず、observation に届いた run 数だけを載せる       |

## Phase 3: レポート

`report.write_report(root, observations)` を呼ぶ。書き出し先の既定は `docs/audit/` で、ファイル名は UTC の `<YYYY-MM-DD>-<HHMMSS>-ablate.md`。

```bash
python3 -c 'import sys; sys.path.insert(0, "skills/ablate/scripts"); sys.path.insert(0, "skills/_lib"); import report, json, pathlib; print(report.write_report(pathlib.Path("."), json.load(sys.stdin)))' < <observations.json>
```

## Output

| 項目           | 内容                                                     |
| -------------- | -------------------------------------------------------- |
| レポートのパス | `write_report` が返したパス                              |
| 削除候補       | レポートの Delete Candidates 節。0 件のときはその旨      |
| 測定できた数   | Verdicts 節のうち `unmeasured` でない行数                |
