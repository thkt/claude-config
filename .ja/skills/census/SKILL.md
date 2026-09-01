---
name: census
description: コードに存在するが DR の無い設計判断を発掘し、impact と reversibility でランク付けした DR 化候補リストを生成する。既存 DR とコードの drift スキャンを担う adrift と組む。
when_to_use: 判断未記録の発掘, undocumented decisions, DR候補発掘, ADR候補発掘, 設計判断棚卸し, decision archaeology, design rationale audit
allowed-tools: Read Write LS Bash(date:*) Bash(python3:*) Bash(ugrep:*) Bash(git:*) Agent AskUserQuestion
model: opus
argument-hint: "[file or directory]"
---

# /census - DR ギャップ監査

判定基準はすべて ${CLAUDE_SKILL_DIR}/references/decision-criteria.md が持つ。impact / reversibility、incomplete-contract の定義、DR 化価値の経験則、challenge の観点、verdict の対応表がそこにある。

## 入力

`$ARGUMENTS` は監査スコープを表す任意のパス。集める範囲は下表が定める。スコープを限定したときは、レポート Summary の Scope 行に対象を記録する。

| $ARGUMENTS   | source            | doc                       |
| ------------ | ----------------- | ------------------------- |
| なし         | リポジトリルート  | トップ階層と `docs/` 配下 |
| ディレクトリ | そのパス          | その subtree              |
| ファイル     | そのファイル 1 件 | 集めない                  |

## Phase 1: 収集

1. `python3 ${CLAUDE_SKILL_DIR}/scripts/list-source-files.py <source>` で source を列挙する。exit code 3 は件数が script の `SOURCE_CAP` を超えた印。AskUserQuestion でサブディレクトリ、上位 N 件、特定モジュールのいずれかに絞ってから Phase 2 へ進む
2. doc は ${CLAUDE_SKILL_DIR}/references/detection-targets.md のファイルパターンで探す

## Phase 2: 発掘

検出事項は ${CLAUDE_SKILL_DIR}/templates/report-template.md の表の列で記録する。source 由来は Source File Decisions、doc 由来は Prose Document Decisions。Impact と Reversibility の列は Phase 4 で埋める。Evidence はコメント、命名、module-doc、commit のいずれかで、commit 由来は `commit <sha>` と書く。

### Step 1: source から

1. ファイルごとに `git log --follow --format='%h %s' -- <file>` を実行し、${CLAUDE_SKILL_DIR}/references/detection-targets.md の決定動詞を含む commit を候補にする
2. ファイルごとに general-purpose の Agent を起動し、ファイルパスと判定基準ファイルの incomplete-contract 節を渡して、次の 4 点に答えさせる

- なぜこのファイルはこの粒度・形になっているか
- コードから読み取れない不変条件や契約を担っているか
- 根拠を記録したコメントや module-doc があるか
- コメントが現状だけを述べ、将来の貢献者向けのルールを欠く incomplete-contract に該当するか

### Step 2: doc から

検出した各ドキュメントで決定動詞を含む文を ugrep で探し、各一致を候補にする。

## Phase 3: DR 照合

DR ディレクトリ (`<git-root>/docs/decisions/`、`DR_DIR` があればその先) があるとき、Phase 2 の全候補を既存 DR と照合する。覆われた候補は除外し、件数を Summary に "DR-covered (excluded)" として記録する。ディレクトリが無ければ全候補がそのまま Phase 4 へ進む。

## Phase 4: 判定

### Step 1: タグ付けと初期ランク付け

各候補に impact と reversibility を付与し、下表を上から読んで最初に該当した行で昇格を決める。

| 条件                                               | 扱い                               |
| -------------------------------------------------- | ---------------------------------- |
| `incomplete-contract=Yes`                          | 昇格する。`documented?` は問わない |
| `(impact = H) AND (reversibility = low OR medium)` | 昇格する                           |
| それ以外                                           | 記録するが昇格しない               |

### Step 2: Devil's Advocate Challenge

昇格候補 1 件ごとに `critic-design` を Agent で起動し、その候補と ${CLAUDE_SKILL_DIR}/references/decision-criteria.md を渡す。返る verdict (confirmed / weakened / needs_revision) と weaknesses を、判定基準ファイルの対応表で keep / downgrade / drop に写す。初期ランク付けと並べて記録する。

## Phase 5: レポート出力

1. `date -u +%Y-%m-%d-%H%M%S` の出力に `-dr-gaps.md` を付けた名前で `docs/audit/` に書く。UTC なら同日の再実行で名前が衝突しない
2. ${CLAUDE_SKILL_DIR}/templates/report-template.md のプレースホルダーを検出事項で置換する
3. DR Promotion Candidates 表の直前に集計行 `keep N / downgrade N / drop N` を置く
4. 候補数と DR 化候補数をコンソールに出力する

## 引き継ぎ

- `keep` は `/dr` で起票するか `/issue` で単一の追跡 issue にまとめる
- `downgrade` はコメント強化タスクとしてリストする
- `drop` はレポートに記録するのみで後続にしない
- 既存 DR の drift スキャンは `/adrift` が担う。DR があるリポジトリでは先に実行し、drift で拾えないギャップをこの skill で発掘する
- 実コード修正と README 更新は範囲外

## 完了条件

以下をすべて満たしたときのみ終了する。満たせない項目は理由をレポートに記録する。

| 項目           | 条件                                                 |
| -------------- | ---------------------------------------------------- |
| レポート       | `docs/audit/<YYYY-MM-DD>-<HHMMSS>-dr-gaps.md` が存在 |
| ソースファイル | レビューした各ファイルを記載                         |
| ドキュメント   | スキャンした各ドキュメントに抽出セクション           |
| 根拠           | 各検出事項に Evidence が入る                         |
| タグ           | 各候補に impact と reversibility が付与              |
| DR 化候補      | 末尾に一行の根拠付きでリスト                         |
