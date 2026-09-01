---
name: ablate
description: ハーネスの各要素を 1 つずつ外して走らせ、その要素が結果を動かしているかを判定する。動かしていない要素を削除候補として挙げる。
when_to_use: ablation, 片側アブレーション, ハーネス要素の効果測定, 削除候補の洗い出し, harness ablation, which rules actually matter
allowed-tools: Read Write LS Bash(python3:*) Bash(claude:*)
model: opus
argument-hint: "[要素のパス]"
---

# /ablate - ハーネスの片側アブレーション

リポジトリルートで実行する。判定に使う数値と基準はすべて script が持ち、この本文には書かない (`docs/wiki/deterministic-script-judgment.md`)。

| 基準                           | 所在                                                     |
| ------------------------------ | -------------------------------------------------------- |
| アーム一覧、実行回数、合意閾値 | `${CLAUDE_SKILL_DIR}/scripts/arms.py`                    |
| verdict の対応表               | `${CLAUDE_SKILL_DIR}/scripts/verdict.py`                 |
| DR ゲート                      | `${CLAUDE_SKILL_DIR}/scripts/dr_gate.py`                 |
| 計測窓、rare-by-design の集合  | `${CLAUDE_SKILL_DIR}/scripts/usage_counts.py`            |
| 規則ごとの起動タスク           | `${CLAUDE_SKILL_DIR}/references/measurement-criteria.md` |

## Input

`$ARGUMENTS` は測定対象を 1 つに絞る要素のパス。省略時は Phase 1 が列挙した全要素を対象にする。

## Phase 1: 列挙

次のコマンドの出力が要素一覧で、1 件が `{path, classification}`。`$ARGUMENTS` がある場合は、その path の 1 件だけを残す。

```bash
python3 skills/_lib/harness_elements.py .
```

## Phase 2: アーム実行

要素ごとに、`${CLAUDE_SKILL_DIR}/references/measurement-criteria.md` の表からその要素の行を引き、Trigger task ID と Task を取る。行がない要素は observation の `trigger_task` を null にする。

行がある要素は、`arms.ARMS` の各アームについて `arms.arm_command(arm, task, element, root)` が返すコマンドを `arms.RUN_COUNT` 回走らせる。wiped アームの各 run について、その要素の指示を transcript が守っているかを読んで True/False を付ける。結果を読めなかった run は `runs` に入れない。

observation は要素ごとに 1 件で、全要素を 1 つの JSON 配列ファイルに書く。

| キー           | 値                                                      |
| -------------- | ------------------------------------------------------- |
| `path`         | Phase 1 の path                                         |
| `trigger_task` | 表の Trigger task ID。行がなければ null                 |
| `task_set`     | この実行で走らせた Trigger task ID の一覧               |
| `runs`         | wiped アームの run ごとの True / False。読めた run のみ |

## Phase 3: レポート

observation の JSON を渡して次を走らせる。`write_report` が verdict の分類、DR ゲートによる保留、`usage_counts` の発火回数の合流を行い、`docs/audit/<YYYY-MM-DD>-<HHMMSS>-ablate.md` (UTC) を `${CLAUDE_SKILL_DIR}/templates/report-template.md` の節順で書く。

```bash
python3 -c 'import sys, json, pathlib; sys.path[:0] = ["skills/ablate/scripts", "skills/_lib"]; import report; print(report.write_report(pathlib.Path("."), json.load(sys.stdin)))' < <observations.json>
```

## Output

この skill は判定で止まる。削除は別の実行で、削除候補を `docs/wiki/retire-rename-procedure.md` へ渡す。

| 項目           | 内容                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| レポートのパス | `write_report` が返したパス                                               |
| 削除候補       | レポートの Delete Candidates 節。0 件のときはその旨                       |
| unmeasured     | Verdicts 節の `unmeasured` 行と、その理由 (表に行がない、または run 不足) |
