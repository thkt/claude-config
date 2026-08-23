# AI-DLC v2 との対応

awslabs/aidlc-workflows v2 の stage と、このハーネスの workflow と skill を両方向で突き合わせた表。守備範囲を広げる提案が来たとき、どこを意図的に持っていないかを読む材料にする。

計測時点は upstream の `v2` ブランチ `840ba653` (2026-08-22)。stage ディレクトリはこの 2 週間で 4 回動いたので、読むときは sha を確認する。

## 出典

一次出典は `main` ではなく `v2` ブランチにある。`main` は今も AI-DLC 1.x で、3 phase 14 stage を 1 ファイルに収める。既定ブランチから測ると 1.x を測ることになる。

stage 定義の正は各 stage ファイルの YAML frontmatter で、`stage-graph.json` はそこからコンパイルされる。

| 対象               | パス (branch `v2`)                                          |
| ------------------ | ----------------------------------------------------------- |
| stage 定義 33 件   | `core/aidlc-common/stages/<phase>/<slug>.md`                |
| frontmatter の契約 | `core/aidlc-common/protocols/stage-definition.md`           |
| コンパイル結果     | `dist/{claude,codex,copilot}/…/tools/data/stage-graph.json` |

## stage 数

phase は 5 つで、これは数え上げの結果ではなく schema の制約になっている。`stage-definition.md:50` が `initialization | ideation | inception | construction | operation` を値の集合として列挙する。

stage は 2026-08-08 時点で 32、`840ba653` で 33。差は追加でなく分割 1 件で、`inception/application-design.md` が `domain-design.md` と `contract-design.md` に分かれた (`74a51a10`、2026-08-13)。

| 時点                    | initialization | ideation | inception | construction | operation | 計  |
| ----------------------- | -------------- | -------- | --------- | ------------ | --------- | --- |
| `5f6b310f` (2026-08-08) | 3              | 7        | 7         | 7            | 7         | 32  |
| `840ba653` (2026-08-22) | 3              | 7        | 9         | 7            | 7         | 33  |

## 突き合わせの規則

**matched** は 2 つが同時に成り立つときに限る。同じ活動が起動契機になっていること、そしてその stage の `produces[]` の役割を埋める成果物を手元が作ること。名前の近さは数えない。

**partial** は片方だけが成り立つ。**unmatched** はどちらも成り立たない。

## v2 の stage から見た対応

33 stage のうち matched 4、partial 8、unmatched 21。

OPERATION phase の 7 stage が全て unmatched であることは、`deploy|observab|incident|rollback|provision` の 5 語で `workflows/` と `skills/` を走査して確かめた。`tests/` を除く 20 行のヒットは全て別物で、形容詞の "observable"、rollback リスクを書かせるテンプレート、検索先ディレクトリの列挙、コード例だった。

| #   | stage                    | 判定      | 手元の相当                                                                                            |
| --- | ------------------------ | --------- | ----------------------------------------------------------------------------------------------------- |
| 0.1 | workspace-scaffold       | unmatched | -                                                                                                     |
| 0.2 | workspace-detection      | unmatched | -                                                                                                     |
| 0.3 | state-init               | unmatched | `workflows/_lib/run-workflow.js` が run ごとの状態を持つが、これは配管であって stage ではない         |
| 1.1 | intent-capture           | partial   | `/outcome` の Outcome state が intent-statement を埋める。stakeholder-map は無い                      |
| 1.2 | market-research          | unmatched | -                                                                                                     |
| 1.3 | feasibility              | partial   | `/challenge` が GO / NO-GO を返す。constraint-register は OUTCOME.md § Constraints                    |
| 1.4 | scope-definition         | partial   | OUTCOME.md § Non-goals が scope-document。`/slice` は backlog を作るが、起点は intent でなく plan     |
| 1.5 | team-formation           | unmatched | -                                                                                                     |
| 1.6 | rough-mockups            | unmatched | -                                                                                                     |
| 1.7 | approval-handoff         | partial   | `/issue` が引き渡し成果物、`/dr` が decision-log。互いに gate されない                                |
| 2.1 | reverse-engineering      | partial   | `/research` の報告書と `/census` の未記録判断の棚卸し                                                 |
| 2.2 | practices-discovery      | matched   | `/scribe` が closed PR / issue と research 成果から規則を抽出し、コードで検証して `docs/wiki/` へ出す |
| 2.3 | requirements-analysis    | unmatched | requirements を持つ成果物の分類が無い                                                                 |
| 2.4 | user-stories             | unmatched | -                                                                                                     |
| 2.5 | refined-mockups          | unmatched | `reviewer-accessibility` は作られた UI を見るだけで、設計成果物を作らない                             |
| 2.6 | domain-design            | partial   | `/dr` が decisions を MADR v4 で埋める。component モデルは無い                                        |
| 2.7 | units-generation         | matched   | `/slice` が plan を垂直スライスへ割り、依存順に公開する                                               |
| 2.8 | contract-design          | unmatched | -                                                                                                     |
| 2.9 | delivery-planning        | partial   | `/think` が unit を持つ plan を作る。allocation と sequencing-rationale は無い                        |
| 3.1 | functional-design        | partial   | `/think` の plan は設計水準だが functional spec ではなく、置き場も issue の `## Plan` 節              |
| 3.2 | nfr-requirements         | unmatched | reviewer は実装後に見る。要件としての成果物は無い                                                     |
| 3.3 | nfr-design               | unmatched | -                                                                                                     |
| 3.4 | infrastructure-design    | unmatched | -                                                                                                     |
| 3.5 | code-generation          | matched   | `workflows/code.js` が unit ごとに Red → Green で実装する                                             |
| 3.6 | build-and-test           | matched   | `code.js` と `build.js` の Verify 段                                                                  |
| 3.7 | ci-pipeline              | unmatched | CI はあるが、それを生成する workflow / skill は無い                                                   |
| 4.1 | deployment-pipeline      | unmatched | -                                                                                                     |
| 4.2 | environment-provisioning | unmatched | -                                                                                                     |
| 4.3 | deployment-execution     | unmatched | -                                                                                                     |
| 4.4 | observability-setup      | unmatched | -                                                                                                     |
| 4.5 | incident-response        | unmatched | -                                                                                                     |
| 4.6 | performance-validation   | unmatched | -                                                                                                     |
| 4.7 | feedback-optimization    | unmatched | `workflows/adrift.js` は drift 報告を出すが、対象は DR とコードの乖離であって稼働系ではない           |

## 手元から見た対応

workflow 7 本と lifecycle skill 16 本の計 23 のうち matched 4、partial 10、unmatched 9。`use-*` 11 本は context loader で、突き合わせる stage を持たないため母数から外す。

| 手元の単位            | 判定      | v2 の相当                                                                                        |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| `workflows/build.js`  | matched   | conductor 配下の construction 実行 (3.5 + 3.6)。Branch / Ship 側に相当は無い                     |
| `workflows/code.js`   | matched   | 3.5 code-generation (`for_each` unit)                                                            |
| `workflows/audit.js`  | partial   | `stage-protocol-reviewer.md` の 2 者批評は stage ごとで、diff 全体への reviewer fan-out ではない |
| `workflows/assert.js` | partial   | 同じ reviewer protocol と成果物ガード。独立した merge 可否の判定は無い                           |
| `workflows/adrift.js` | unmatched | v2 の `traceability` sensor は前向きの網羅で、記録した判断の decay 検出ではない                  |
| `workflows/polish.js` | unmatched | -                                                                                                |
| `workflows/shake.js`  | unmatched | -                                                                                                |
| `/scribe`             | matched   | 2.2 practices-discovery                                                                          |
| `/slice`              | matched   | 2.7 units-generation                                                                             |
| `/census`             | partial   | 2.2 は repository から規則を発見する。census は未記録の判断を発見する                            |
| `/challenge`          | partial   | 1.3 feasibility                                                                                  |
| `/dr`                 | partial   | 2.6 domain-design の decisions                                                                   |
| `/fix`                | partial   | v2 は `bugfix` を scope (stage 選択のフィルタ) として持つ。stage としては持たない                |
| `/issue`              | partial   | 1.7 approval-handoff                                                                             |
| `/outcome`            | partial   | 1.1 intent-capture                                                                               |
| `/research`           | partial   | 2.1 reverse-engineering、1.2 market-research                                                     |
| `/think`              | partial   | 2.9 delivery-planning、3.1 functional-design                                                     |
| `/checkout`           | unmatched | -                                                                                                |
| `/commit`             | unmatched | -                                                                                                |
| `/pr`                 | unmatched | -                                                                                                |
| `/preview`            | unmatched | -                                                                                                |
| `/qualify`            | unmatched | -                                                                                                |
| `/transcribe`         | unmatched | -                                                                                                |

## 非対称が示すもの

v2 はライフサイクルを 1 回縦断する。33 stage が `requires_stage` の DAG で並び、`display_order` はそこから計算され、各 stage は人が 1 度承認する。

手元にライフサイクルのグラフは無い。workflow 7 本はそれぞれ独立に起動され、うち 5 本 (`audit`、`assert`、`polish`、`shake`、`adrift`) は同じ構築とレビューの帯へ入り直す保証パスになる。`build.js` と `code.js` は散文で先行を名指すが (「`## Plan` を `/think` と `/issue` で書いてから起動し直す」「think skill が作る形の plan」)、それは人が満たす前提であって、`requires_stage` に相当するものも、起動を拒む機構も無い。

広さと深さの違いは検証層に数字として出る。

この違いは、守備範囲を ideation や運用へ広げる提案が OUTCOME の軸から外れることを示す。`.claude/OUTCOME.md` § Constraints はハーネスを Claude Code の hook、skill、plugin の面に縛る。v2 のエンジン (`aidlc-orchestrate.ts`、`aidlc-state.ts`、コンパイル済みの stage グラフ) はその面の外にあるので、v2 の stage は stage のままでは移植できない。

|                                      | v2       | 手元                                      |
| ------------------------------------ | -------- | ----------------------------------------- |
| 決定論的な sensor                    | 6 種     | reviewer 18 + critic 3                    |
| 文書形状チェックのみの stage         | 33 中 19 | -                                         |
| `linter` / `type-check` を持つ stage | 7        | -                                         |
| 1 回の audit が回す段                | -        | reviewer → challenge → verify → integrate |

## 読み直すとき

`v2` ブランチは stage ディレクトリだけで 2 週間に 4 回動いた。この表は `840ba653` のスナップショットで、読み直すときは stage 数から数え直す。

タグは当てにならない。`v2.1.1` から `v2.3.0` は v2 系列自身のタグだが、`package.json` はどれも `0.0.0` で、release は存在しない。読み手が使える版はコミット件名 (`(2.6.55)` など) にしかない。
