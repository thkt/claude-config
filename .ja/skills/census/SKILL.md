---
name: census
description: コードに存在するが DR の無い設計判断を発掘し、impact と reversibility でランク付けした DR 化候補リストを生成する。既存 DR とコードの drift スキャンを担う adrift と組む。
when_to_use: 判断未記録の発掘, undocumented decisions, DR候補発掘, ADR候補発掘, 設計判断棚卸し, decision archaeology, design rationale audit
allowed-tools: Read Write LS Bash(mkdir:*) Bash(date:*) Bash(python3:*) Bash(ugrep:*) Bash(git:*) Task AskUserQuestion
model: opus
argument-hint: "[file or directory]"
---

# /census - DR ギャップ監査

## 入力

`$ARGUMENTS` は監査スコープを表す任意のパス。何を集めるかは Phase 1 の表が定める。スコープを限定したときは、レポート Summary の Scope 行に対象を記録する。

## 判定基準

判定基準はすべて ${CLAUDE_SKILL_DIR}/references/decision-criteria.md にある。impact/reversibility、incomplete-contract の定義、DR 化価値の経験則、challenge 観点がそこに入る。

## Phase 1: 収集

source は ${CLAUDE_SKILL_DIR}/scripts/list-source-files.py を python3 で実行して列挙する。doc は ${CLAUDE_SKILL_DIR}/references/detection-targets.md のファイルパターンでスキャンする。どちらもどこを見るかは `$ARGUMENTS` で決まる。

| $ARGUMENTS   | source            | doc                       |
| ------------ | ----------------- | ------------------------- |
| なし         | リポジトリルート  | トップ階層と `docs/` 配下 |
| ディレクトリ | そのパス          | その subtree              |
| ファイル     | そのファイル 1 件 | 集めない                  |

Phase 2 の reviewer を並列起動する前に、AskUserQuestion で絞り込みを確認する。確認が要るのは source が目安の 20 件を超えるときで、目安以下なら省く。選択肢はサブディレクトリ、上位 N 件、特定モジュールなど。

## Phase 2: 発掘

各検出事項を次の 5 項目で記録する。

| 項目                   | 値                                                                          |
| ---------------------- | --------------------------------------------------------------------------- |
| 位置                   | `file:line`                                                                 |
| 判断概要               | 1 行                                                                        |
| 根拠                   | コメント、命名、module-doc、commit のいずれか。commit 由来は `commit <sha>` |
| `documented?`          | Yes / Partial / No                                                          |
| `incomplete-contract?` | Yes / No                                                                    |

### Step 1: source から

各ソースファイルについて、その言語に合う reviewer subagent を Task で起動する。reviewer は以下に答える。

- なぜこのファイルはこの粒度・形になっているか
- コードから読み取れない不変条件や契約を担っているか
- 根拠を記録したコメントや module-doc があるか
- コメントが現状だけを述べ、将来の貢献者向けのルールを欠く `incomplete-contract` パターンに該当しないか

reviewer は git にアクセスできない。そこで `/census` 自身が `git log --follow --format='%h %s' -- <file>` を実行し、決定動詞を含む commit を抽出する。決定動詞の一覧は ${CLAUDE_SKILL_DIR}/references/detection-targets.md にある。

### Step 2: doc から

検出された各ドキュメントについて、決定動詞を含む文を検索し、各一致を候補化する。

## Phase 3: DR 照合

Phase 2 の全候補を既存 DR と相互参照する。覆われた候補は除外し、除外件数を Summary に "DR-covered (excluded)" として記録する。照合するのは DR ディレクトリがあるときで、無ければ全候補がそのまま Phase 4 へ進む。

## Phase 4: 判定

### Step 1: タグ付けと初期ランク付け

各候補に impact と reversibility を付与する。DR 化候補は `(impact = H) AND (reversibility = low OR medium)` を満たすもの。

`incomplete-contract=Yes` の検出事項は `documented?` の値に関わらず昇格する。それ以外の検出事項は記録するが昇格しない。

### Step 2: Devil's Advocate Challenge

1. `critic-design` を Task で起動し、初期の昇格候補リストと ${CLAUDE_SKILL_DIR}/references/decision-criteria.md を渡す
2. agent が返す verdict (confirmed/weakened/needs_revision) と weaknesses を受け取る。返す内容は agent 自身の定義が決める
3. weaknesses を候補ごとに突き合わせ、判定基準ファイルの keep/downgrade/drop 表で各候補を判定する
4. 判定を初期ランク付けと並べて記録する

## Phase 5: レポート出力

1. ${CLAUDE_SKILL_DIR}/templates/report-template.md に従い、プレースホルダーを検出事項から置換して書く
2. DR Promotion Candidates 表の直前に、全候補を集計した 1 行 `keep N / downgrade N / drop N` を置く
3. 候補数と DR 化候補数をコンソールに出力する

```bash
mkdir -p docs/audit
STAMP=$(date -u +%Y-%m-%d-%H%M%S)  # UTC の日付 + HHMMSS。同日に再実行しても衝突しない
REPORT="docs/audit/${STAMP}-dr-gaps.md"
```

## 引き継ぎ

- challenge 後の `keep` 候補のみ表示し、各候補を `/dr` で起票するか `/issue` で単一の追跡 issue にまとめる
- `downgrade` 候補はコメント強化タスクとしてリストする。`drop` 候補はレポートに記録するのみで後続にしない
- DR 起草は `/dr`、既存 DR の drift スキャンは `/adrift` が担う。実コード修正と README 更新は範囲外
- DR が既にあるリポジトリでは `/adrift` を先に実行し、drift で拾えないギャップをこの skill で発掘する

## 完了条件

以下をすべて満たしたときのみ終了する。満たせない項目は理由をレポートに記録する。

| 項目           | 条件                                                 |
| -------------- | ---------------------------------------------------- |
| レポート       | `docs/audit/<YYYY-MM-DD>-<HHMMSS>-dr-gaps.md` が存在 |
| ソースファイル | レビューした各ファイルを記載                         |
| ドキュメント   | スキャンした各ドキュメントに抽出セクション           |
| タグ           | 各候補に impact と reversibility が付与              |
| DR 化候補      | 末尾に一行の根拠付きでリスト                         |
