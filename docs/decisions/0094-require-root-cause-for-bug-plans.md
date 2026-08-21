---
status: "accepted"
date: "2026-07-31"
decision-makers: thkt
---

# DR-0094: Bug の plan に root_cause を要求する判定を title のプレフィックスで行う

## Context and Problem Statement

`.ja/skills/think/SKILL.md:20` の Phase 1 は Why を 3 点 (誰がどんな痛みを抱えているか、何を成功とみなすか、なぜ今やるか) で構成し、壊れている原因を問う項を持たない。そのため Bug タスクは症状の記述だけで Phase 2 の設計探索へ入れる。

Issue #286 は `/qualify` の実運用フィードバックを記録する。2026-07-29 に業務リポジトリの issue #2325 で「まだ任せっきりにやると場当たり的な対応をして fat になるので、根本原因を詰めてから qualify かけ直して要件を詰めるってことをしました」という指摘が出た。原因が未確定のまま案を並べると、症状に効くだけの対処が案として通ってしまう。

対処には決定論の強制点が要る。skill の散文だけでは原因未言明の Bug を止められない。skill テストは SKILL.md への presence assertion しかせず、行が存在しても走行中の LLM が無視すれば通過してしまう。強制点を `workflows/build.js` の `validate()` に置くには、plan のどの入力を Bug 判定の軸にするかを決める必要がある。GitHub Issue は `label` と `title` の両方で種別を表現できるが、この 2 つは同じ判定を保証しない。

## Decision Drivers

- 強制点は `validate()` に置く。散文の規則は presence assertion しか検査できず、原因未言明の Bug を機械的に止められない
- `/issue` は既に `[Feature]`/`[Bug]`/`[Docs]`/`[Chore]` のプレフィックスを title に付与している (`skills/issue/SKILL.md` の Type detection、`skills/qualify/SKILL.md:42` の Title type 軸)。この規約は Bug 判定の入力として既に存在する
- `label` は GitHub 側の付与操作を要し、issue 作成後に外れる・付け忘れる・複数 label が競合するといった運用揺れが起きる。title のプレフィックスは `/issue` が生成する文字列そのものであり、生成と判定が同じ場所で閉じる
- build の Load 段は `gh issue view` で取得した issue 本体から plan を extract する。fetch した値を判定に使うなら、既に取得している `title` を追加で使う方が、`label` を新規に取得経路へ足すより変更が小さい

## Considered Options

- Option A: `title` の先頭が `[Bug]` かどうかで判定する
- Option B: `label` に `bug` が付いているかどうかで判定する
- Option C: `title` と `label` の両方を見て、一方でも Bug を示せば判定する

## Decision Outcome

Option A を採用する。title のプレフィックスは `/issue` の Type detection が生成する既存の規約であり、`skills/qualify/SKILL.md` も同じ文字列を Title type 軸の検査に使っている。build 側は `gh issue view` で取得済みの `title` をそのまま使えるため、`FETCH_SCHEMA` への追加が最小で済む。

label は運用者による付け外しを経由するため、issue 作成直後の plan 抽出時点で最新の label 状態が判定に反映される保証がない。title は issue 本文と同じ取得経路上にあり、作成時点の値がそのまま plan 抽出まで保持される。

Option C は title と label の両方を判定入力にする分だけ検査ロジックが増え、2 つの情報源が食い違った場合の優先順位を新たに決める必要が生じる。今回強制したいのは「Bug と名乗った issue に原因を書かせる」ことであり、判定入力を 1 つに絞れる Option A で足りる。

### Consequences

- Good, because 判定を `title` 1 つに絞ることで、build の `FETCH_SCHEMA` への追加が `title` フィールド 1 つで済み、`label` の取得経路や優先順位の検査を新設せずに済む
- Good, because `/issue` が生成する title のプレフィックスと `/qualify` の Title type 軸 (`skills/qualify/SKILL.md:42`) が同じ文字列を参照するため、生成側・検査側・判定側の語彙が 1 つに揃う
- Bad, because 種別のプレフィックスを付け忘れた issue、またはプレフィックスを持たない経路 (手動作成、他ツール由来の import) で作られた issue は、実質的に Bug であっても title 判定をすり抜け、root_cause 未記載のまま plan が validate を通過する
- Bad, because label で Bug 運用をしているチームや、後から `bug` label だけを付け直した issue との整合はこの判定に反映されない。label ベースの検査を要する場合は別途 Option C 相当の拡張が要る

### Confirmation

`workflows/build.js` の `FETCH_SCHEMA` が `title` を保持し、`validate()` が `title` の先頭が `[Bug]` の plan に対して `root_cause` の不足を errors へ積むこと。`node --test workflows/build/tests/build.behavior.test.js` が green であること。

## Pros and Cons of the Options

### Option B: label の `bug` で判定する

GitHub の `label` フィールドを Bug 判定の入力にする。

- Good, because title のプレフィックス付け忘れの影響を受けない。label は issue 一覧やフィルタ操作からも独立して見える
- Bad, because build の Load 段が `label` を取得経路に新設する必要があり、`gh issue view` の呼び出しに `labels` フィールドを足す変更が要る
- Bad, because label は作成後に付け外しできるため、plan 抽出時点の label 状態が作成時点の意図と一致する保証がない

### Option C: title と label の両方を見る

いずれか一方が Bug を示せば判定する。

- Good, because title の付け忘れと label の付け忘れの両方を個別に補える
- Bad, because 2 つの情報源が食い違った場合の優先順位を新たに決める必要が生じ、`validate()` の分岐が増える
- Bad, because Option A 単体で解ける「Bug と名乗った issue に原因を書かせる」という当面の要求に対して、判定入力を増やす分のコストが釣り合わない

## More Information

### Before / After comparison

| 項目                     | Before                                    | After                                                                |
| ------------------------ | ----------------------------------------- | -------------------------------------------------------------------- |
| Bug の定義軸             | label と title の混在                     | title の `[Bug]` プレフィックスに統一                                |
| root_cause の検査        | skill の散文規則のみ（強制なし）          | `validate()` で機械的に検査                                          |
| Bug 判定の入力元         | issue の複数フィールド (title/label/body) | issue の title フィールドのみ                                        |
| 判定条件と検査条件の関係 | 分散（生成側・検査側が異なる語彙を使用）  | 統一（`/issue` 生成・`/qualify` 検査・build 判定が同じ文字列を参照） |

### Reassessment Triggers

- 種別プレフィックスを付け忘れた Bug issue が実際に root_cause 未記載のまま build を通過する事例が確認されたとき。Issue #286 の Backlog candidates は label との併用、または本文の再現手順の有無を併せて見る案を残している
- title のプレフィックス規約自体 (`[Bug]` 等) が `/issue` から変更されたとき、この DR の判定条件も追従が必要になる
