---
name: dr
description: MADR v4 形式で Decision Record (DR) を自動採番付きで作成する。対象はアーキテクチャに限らず、覆しにくく文脈なしでは意外に見える決定すべて。
when_to_use: DR作成, ADR作成, 技術決定, アーキテクチャ決定, decision record
allowed-tools: Read Write Edit LS Bash(mkdir:*) Bash(${CLAUDE_SKILL_DIR}/scripts/*) AskUserQuestion Bash(ugrep:*) Bash(bfs:*)
model: opus
argument-hint: "[decision title]"
---

# /dr - Decision Record 作成

## 入力

決定タイトルは `$ARGUMENTS` で受け取り、"Adopt X for Y" のような具体的なアクションに整える。空なら AskUserQuestion で New decision/Update existing を確認し、Update existing なら `<git-root>/docs/decisions/` の既存 DR から選択させる (§ 既存 DR の更新)。保存先の変更は `DR_DIR` 環境変数を設定して実行する。

## 採用ゲート

次の 3 条件すべてが成り立つときだけプロセスへ進む。

1. 覆しにくい。後から決定を変えるには相応のコストがかかる
2. 文脈がないと意外に見える。将来の読み手が「なぜこの形にしたのか」と疑問を持つ
3. 実在するトレードオフの結果。本物の代替案が存在し、特定の理由で 1 つを選んでいる

条件が欠けるときは DR を作らず、下表の場所へ決定を記録する。

| 欠けた条件 | 記録先                                    |
| ---------- | ----------------------------------------- |
| 1 か 2     | `CONTEXT.md` エントリか相当する設計ノート |
| 3 のみ     | コミットメッセージ本文                    |

## プロセス

| Step | 工程       | 内容                                                                                                                                                                                                                    |
| ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Pre-Check  | ${CLAUDE_SKILL_DIR}/scripts/pre-check.py "$TITLE" を実行する。`similar_drs` が非空なら続行前にユーザーへ確認する。DR は返り値の `dr_dir` 配下に `filename` の名前で書き、`number` と `date` を本文と frontmatter に写す |
| 2    | Type       | 決定の意図で決定タイプを判定し、推奨トピックを選ぶ (§ 決定タイプ)                                                                                                                                                       |
| 3    | References | プロジェクトドキュメント、issue、外部リソースを収集する                                                                                                                                                                 |
| 4    | Draft      | ${CLAUDE_SKILL_DIR}/templates/madr-template.md を写し、収集した内容で埋める (§ YAML Frontmatter)                                                                                                                        |
| 5    | Challenge  | 既存 DR の原則に例外を作る、または既存 DR を supersede する場合だけ `/challenge` を通し、verdict と成立条件を More Information に 1 行で残す                                                                            |
| 6    | Validate   | ${CLAUDE_SKILL_DIR}/scripts/validate-dr.py "$DR_FILE" を実行する。exit 0 かつ `errors[]` が空で合格。`warnings[]` は参考                                                                                                |
| 7    | Index      | ${CLAUDE_SKILL_DIR}/scripts/update-index.py を実行し、index README を再生成する                                                                                                                                         |

## 決定タイプ

決定タイプの違いが影響するのは、More Information に置く推奨トピックの選択のみ。各セクションの分量目安は全タイプ共通で、Context は 3 行、Options は各 3〜5 行、Consequences は箇条書き 2〜3 項目とする。

| 決定タイプ           | ユースケース                   | 行数上限 | 推奨トピック                                                                  |
| -------------------- | ------------------------------ | -------- | ----------------------------------------------------------------------------- |
| technology-selection | ライブラリ、フレームワーク選定 | 80 行    | Migration Strategy, Rollback Plan, Success Criteria                           |
| architecture-pattern | 構造、設計方針                 | 80 行    | Architecture Diagram, Quality Attributes, Trade-offs                          |
| process-change       | ワークフロー、ルール変更       | 100 行   | Before / After 比較, Transition Plan, Review Schedule                         |
| deprecation          | 技術の廃止                     | 100 行   | Deprecation Target, Migration Plan, Deprecation Warning Period, Rollback Plan |

## YAML Frontmatter

frontmatter は任意。書くなら下表のフィールドを使う。

| フィールド      | 備考                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| status          | ${CLAUDE_SKILL_DIR}/references/madr-format.md の Status ライフサイクルから選ぶ。YAML quote 必須、識別子のみリンク不可 |
| date            | 作成日 YYYY-MM-DD。supersede 時のみ更新                                                                               |
| decision-makers | 名前または役割のリスト。v4 で `deciders` から改名                                                                     |
| consulted       | 相談した専門家。やり取りは双方向                                                                                      |
| informed        | 結果を共有する利害関係者。一方向                                                                                      |

## 既存 DR の更新

status が proposed なら本文を直接編集し、Validate と Index を実行する。accepted 以降は決定内容を保持したまま次の手順で新しい DR へ置き換え、旧 DR で変えるのは `status` と `date` だけにする。

1. プロセスで新規 DR を作成する
2. 新規 DR の More Information で先行 DR を引用する (例: `Supersedes DR-NNNN`)
3. 旧 DR の `status:` を `superseded by DR-NNNN` に変更する
4. 旧 DR の `date:` を当日に更新する
5. ${CLAUDE_SKILL_DIR}/scripts/update-index.py を実行してインデックスを更新する

## エラー処理

各 script が失敗を JSON かエラー出力で返す。対応は下表。

| エラー                                     | 扱い                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| git リポジトリの外だと報告                 | `DR_DIR` を設定して保存先を明示する                                     |
| 保存先に SKILL.md があると報告             | skill ディレクトリを指しているので `DR_DIR` を DR 置き場へ向け直す      |
| `similar_drs` が非空                       | 重複候補を提示し、続行するか更新へ切り替えるかを確認 (§ 既存 DR の更新) |
| validate-dr.py が `missing_section` を返す | テンプレートから欠けた見出しを補い、Validate をやり直す                 |

## 出力

| パス                                     | 説明                 |
| ---------------------------------------- | -------------------- |
| `<git-root>/docs/decisions/XXXX-slug.md` | DR ファイル          |
| `<git-root>/docs/decisions/README.md`    | 自動生成インデックス |

## 参照

| トピック | リソース                                      |
| -------- | --------------------------------------------- |
| MADR     | ${CLAUDE_SKILL_DIR}/references/madr-format.md |
| Fowler   | ${CLAUDE_SKILL_DIR}/references/fowler-adr.md  |
