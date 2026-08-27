# Research: issue-build-flow-simplification-impact

Generated: 2026-07-13
Session: 217d90d6-6396-4ea0-9eb9-4a41e0d8a207
Intent: 影響調査 (issue→build フローの人間駆動パイプライン化)
Domain: Harness

## Purpose

/issue の単一スキル連鎖 (challenge / research / think をネスト起動し veto で skip 不能を強制) を廃し、challenge / research / think / issue / build を人間が繋ぐ独立スキルへ再構成する決定に先立ち、旧フロー前提の記述と機構を tracked ファイル全域から棚卸しする。実装はしない。

## 決定方向 (この調査の前提)

- /issue は単独で成立する薄い起票スキルに縮小。前段の成果物 (challenge verdict / research / think の plan) は会話コンテキストにあれば使い、なくても起票は成立する
- 前段の呼び出し (ネスト Skill()) と veto による強制は全廃。人間がオーケストレータになるため police 対象が消える
- build との唯一の硬い契約は issue の `## Plan` section フォーマット (plan-section.md)。build.js Load の validate が最終防衛線として残る
- 痛み: (a) hooks で skip 不能状態を維持するコスト (b) issue のフォーマットと内容の膨らみでレビュー困難 (c) 何をしているか説明しづらく移譲が難しい

## 影響マップ

### 削除 (veto 機構本体)

veto (旧 issue-gate) は #150/#154 で「LLM が全段を自動連鎖する /issue から、証跡なし起票の skip drift を防ぐ」ために導入された。導入 ADR は存在せず、issue (#150/#151/#152/#154/#156/#159) と PR のみが経緯を持つ。

| Path                                   | 規模                         | 備考                                                   |
| -------------------------------------- | ---------------------------- | ------------------------------------------------------ |
| hooks/veto/veto.py                     | 664 行                       | record / verdict-gate / plan-gate / research-gate 一式 |
| hooks/veto/pre-issue-create.sh         | 30 行                        | gh issue create の PreToolUse gate                     |
| hooks/veto/tests/                      | bats×4 + contract + fixtures | 合計 1161 行 (veto 本体込み)                           |
| skills/issue/tests/skip-header.test.js | 1 file                       | veto.py の固定 header 照合と drafting.md の結合テスト  |
| .ja/ mirror                            | 上記すべて×2                 | 実質削除規模 約 2300 行 + fixtures                     |

### 書き換え (スキル)

| File                                              | 旧フロー依存                                                                                                                            | 変更方向                                                                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| skills/issue/SKILL.md                             | Phase 2-3 全体 (premise/source-coverage/challenge/research/think ネスト)、frontmatter hooks、Title Discipline、residual-resolution loop | 薄い起票スキルへ書き直し。type 検出 / テンプレ / Why 聞き返し 1 回 / plan 書き出し (会話にあれば) / preview / 起票のみ |
| skills/issue/references/drafting.md               | L18 の veto skip record 記述                                                                                                            | skip 分岐を単なる型判定に書き換え                                                                                      |
| skills/issue/references/plan-section.md           | なし (build との抽出契約)                                                                                                               | 維持。唯一の硬い契約                                                                                                   |
| skills/issue/references/premise-check.md          | /issue Phase 2 から参照 (12 行)                                                                                                         | 決定点 3                                                                                                               |
| skills/issue/references/tentative-marking.md      | residual loop と連動 (14 行)                                                                                                            | 決定点 3                                                                                                               |
| skills/issue/references/prose-review.md + phrases | /issue Phase 2 から参照                                                                                                                 | 維持候補。issue 可読性 (痛み b) に直結                                                                                 |
| skills/challenge/SKILL.md                         | L61 verdict-gate 呼び出し (title 束縛 + one-way downgrade)、frontmatter record hook                                                     | title 束縛廃止。決定論 downgrade 規則の存廃は決定点 2                                                                  |
| skills/think/SKILL.md                             | Phase 3 step 5-6 plan-gate --title、frontmatter record hook                                                                             | title 束縛廃止。schema 検証の存廃は決定点 1。「Plan の唯一の durable home は issue」は維持で整合                       |
| skills/slice/SKILL.md                             | L25 「plan 品質が要る slice は /issue で refine してから /build へ」                                                                    | 新構成 (/think で plan → /issue で書き出し) への経路説明更新                                                           |
| skills/research/SKILL.md                          | なし (grep 一致は無関係語)                                                                                                              | 変更不要                                                                                                               |

### 書き換え (workflow / packaging / docs)

| File                                | 依存                                                                                            | 変更方向                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| workflows/build.js                  | L6 whenToUse の refine-with-a-human 文言。L244-246 validate_plan が veto.py を canonical と参照 | 文言更新。canonical の所在は決定点 1。L25/110/465 の veto は概念用法 (PR 上の user 拒否対象) で存続 |
| workflows/build/pr-body.py + tests  | 「前提 (veto 対象)」見出し                                                                      | 概念用法のため変更不要                                                                              |
| README.md L74                       | 「Refine an issue with /issue」のフロー説明                                                     | 新フロー説明へ更新                                                                                  |
| .claude-plugin/marketplace.json L18 | 同上の plugin description                                                                       | 同上                                                                                                |
| .ja/ mirror                         | 上記スキル・workflow すべて                                                                     | JA canonical で編集し EN へ反映 (ADR-0073)                                                          |

### 影響なしと確認済み

| 対象              | 確認結果                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| settings.json     | veto 配線なし。発火は skill frontmatter hooks のみ (#154 が計画した settings.json 配線は最終的に不採用)       |
| .github/workflows | veto テストの CI 配線なし (label-from-issue.yml のみ)                                                         |
| workflows/\_lib   | 依存なし (run-workflow.js のみ)                                                                               |
| workflows/tests   | veto / plan-gate / issue 参照なし                                                                             |
| docs/decisions    | issue-gate の ADR は不存在。supersede 対象なし。ADR-0081 (fan-out は workflow へ) との関係は新 ADR で記述     |
| plugin 配布       | marketplace.json は repo 全体を source とする単一 build plugin (ADR-0083)。個別コピー同期なし、削除が自動反映 |

## 決定点 (ADR / issue 化の前に確定すべき残余)

1. plan-gate の canonical の所在。(a) build.js validate を canonical 化し veto.py + contract_build_port.py を削除、/think は自己検証なし (b) title-free の plan-gate を standalone script として残し /think が自己検証、contract test 維持。(b) は起票前に schema エラーを検出でき、feedback_no-llm-self-confidence-as-gate との整合も保つ
2. challenge の one-way downgrade 規則 (irreversible assumption / 8+ assumptions / underspecified で NO-GO) の存廃。title 束縛とは独立した決定論規則であり、残すなら title-free 化のみで済む
3. premise-check / tentative-marking / prose-review を新 /issue にどこまで残すか。prose-review は痛み b (issue 可読性) に直結するため維持候補、premise-check / tentative-marking は residual loop 廃止で存在意義が細る
4. 起票品質の検出が build 時 (Load validate) まで遅延することの受容。人間駆動化の対価として明示的に受け入れるかを ADR に記録する

## フォローアップ

- memory (project_build-js-autonomous-workflow ほか /issue 経路に言及するもの) の記述更新
- open issue に veto / issue-gate 系の残タスクなし (2026-07-13 時点の open list で確認)
