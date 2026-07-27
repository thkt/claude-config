---
name: dr
description: MADR v4 形式で Decision Record (DR) を自動採番付きで作成する。対象はアーキテクチャに限らず、覆しにくく文脈なしでは意外に見える決定すべて。
when_to_use: DR作成, ADR作成, 技術決定, アーキテクチャ決定, decision record
allowed-tools: Read Write Edit LS Bash(mkdir:*) Bash($HOME/.claude/skills/dr/scripts/*) AskUserQuestion Bash(ugrep:*) Bash(bfs:*)
model: opus
argument-hint: "[decision title]"
---

# /dr - Decision Record 作成

## 入力

決定タイトルは `$ARGUMENTS` で受け取り、"Adopt X for Y" のような具体的なアクションに整える。空なら AskUserQuestion で New decision/Update existing を確認し、Update existing なら `<git-root>/docs/decisions/` の既存 DR から選択させる。保存先の変更は `DR_DIR` 環境変数を設定して実行する。

## 採用ゲート

3 条件すべてが成り立つときだけ 5 フェーズプロセスに進む。欠ける場合は DR を作らず、条件 1 か 2 が欠けるなら `CONTEXT.md` エントリか相当する設計ノートに、条件 3 のみ欠けるならコミットメッセージ本文に決定を記録する。

1. 覆しにくい。後から決定を変えるには相応のコストがかかる
2. 文脈がないと意外に見える。将来の読み手が「なぜこの形にしたのか」と疑問を持つ
3. 実在するトレードオフの結果。本物の代替案が存在し、特定の理由で 1 つを選んでいる

## ルール

| ルール       | 詳細                                                              |
| ------------ | ----------------------------------------------------------------- |
| Immutability | 受理後の決定内容は不変。Supersede 手順を参照                      |
| Brevity      | 決定タイプ別のサイズ制限。決定タイプを参照                        |
| Frontmatter  | YAML frontmatter は任意。YAML Frontmatter を参照                  |
| Confirmation | Decision Outcome 配下の `### Confirmation` で遵守の確認方法を記述 |

## YAML Frontmatter (MADR v4)

| フィールド      | 必須 | 備考                                                                                                              |
| --------------- | ---- | ----------------------------------------------------------------------------------------------------------------- |
| status          | No   | proposed, rejected, accepted, deprecated, superseded by DR-NNNN のいずれか。YAML quote 必須、識別子のみリンク不可 |
| date            | No   | 作成日 YYYY-MM-DD。supersede 時のみ更新                                                                           |
| decision-makers | No   | 名前または役割のリスト。v4 で `deciders` から改名                                                                 |
| consulted       | No   | 相談した専門家。やり取りは双方向                                                                                  |
| informed        | No   | 結果を共有する利害関係者。一方向                                                                                  |

### Supersede 手順

新しい DR が既存を置き換える場合。旧 DR で変わるのは `status` と `date` のみで、決定内容はそのまま保持する。

1. 通常の 5 フェーズプロセスで新規 DR を作成
2. 新規 DR の More Information で先行 DR を引用 (例: `Supersedes DR-NNNN`)
3. 旧 DR の `status:` を `superseded by DR-NNNN` に変更
4. 旧 DR の `date:` を当日に更新
5. `${CLAUDE_SKILL_DIR}/scripts/update-index.py` を実行してインデックスを更新

## 決定タイプ

決定タイプの違いが影響するのは、More Information に置く推奨トピックの選択のみ。各セクションの分量目安は全タイプ共通で、Context は 3 行、Options は各 3〜5 行、Consequences は箇条書き 2〜3 項目とする。

| 決定タイプ           | ユースケース                   | 行数上限 | 推奨トピック                                                                  |
| -------------------- | ------------------------------ | -------- | ----------------------------------------------------------------------------- |
| technology-selection | ライブラリ、フレームワーク選定 | 80 行    | Migration Strategy, Rollback Plan, Success Criteria                           |
| architecture-pattern | 構造、設計方針                 | 80 行    | Architecture Diagram, Quality Attributes, Trade-offs                          |
| process-change       | ワークフロー、ルール変更       | 100 行   | Before / After 比較, Transition Plan, Review Schedule                         |
| deprecation          | 技術の廃止                     | 100 行   | Deprecation Target, Migration Plan, Deprecation Warning Period, Rollback Plan |

## 5 フェーズプロセス

| Step | Phase      | 内容                                                                                                                                                                                                                            |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Pre-Check  | `${CLAUDE_SKILL_DIR}/scripts/pre-check.py "$TITLE"` を実行。`similar_drs` が空でなければ続行前にユーザーへ重複を確認する。DR は返り値の `dr_dir` 配下に `filename` の名前で書き、`number` と `date` を本文と frontmatter に写す |
| 2    | Type       | 決定の意図で決定タイプを判定し、決定タイプ表から推奨トピックを選ぶ                                                                                                                                                              |
| 3    | References | プロジェクトドキュメント、issue、外部リソースを収集                                                                                                                                                                             |
| 4    | Validate   | 書き込み後 `${CLAUDE_SKILL_DIR}/scripts/validate-dr.py "$DR_FILE"` を実行。exit 0 + 空の `errors[]` で合格。`warnings[]` は参考                                                                                                 |
| 5    | Index      | `${CLAUDE_SKILL_DIR}/scripts/update-index.py` を実行し、index README を再生成                                                                                                                                                   |

## エラー処理

各 script が失敗を JSON かエラー出力で返す。対応は下表。

| エラー                                     | 動作                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| git リポジトリの外だと報告                 | `DR_DIR` を設定して保存先を明示する                                    |
| 保存先に SKILL.md があると報告             | skill ディレクトリを指しているので `DR_DIR` を DR 置き場へ向け直す     |
| `similar_drs` が非空                       | 重複候補を提示し、新規作成を続けるか既存 DR の更新に切り替えるかを確認 |
| validate-dr.py が `missing_section` を返す | テンプレートから欠けた見出しを補い、再検証する                         |

## 出力

| パス                                     | 説明                 |
| ---------------------------------------- | -------------------- |
| `<git-root>/docs/decisions/XXXX-slug.md` | DR ファイル          |
| `<git-root>/docs/decisions/README.md`    | 自動生成インデックス |

## 参照

| トピック | リソース                                         |
| -------- | ------------------------------------------------ |
| MADR     | `${CLAUDE_SKILL_DIR}/references/madr-format.md`  |
| Fowler   | `${CLAUDE_SKILL_DIR}/references/fowler-adr.md`   |
| Template | `${CLAUDE_SKILL_DIR}/templates/madr-template.md` |
| Scripts  | `${CLAUDE_SKILL_DIR}/scripts/`                   |
