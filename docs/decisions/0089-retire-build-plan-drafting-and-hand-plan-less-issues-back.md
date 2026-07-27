---
status: "accepted"
date: 2026-07-27
decision-makers: thkt
---

# ADR-0089: Plan 節なし issue の plan 自律生成をやめ、build は issue へ差し戻す

## Context and Problem Statement

ADR-0086 は Plan 節なし issue でも fire-and-forget を成立させるため、build.js の Load に draftPlan (plan 生成 + critic-design gate) を置いた。生成した plan は critic-design の GO と構造 validate だけを通って Code に入るため、unit 分割と test scenario という plan の質を決める判断が、人間の選択を経ずに実装へ流れる。ADR-0086 は自身の Consequences でこれを「ADR-0085 の『検証済みの選択だけ実装する』原則を生成 path に限って緩める」と記録していた。

ADR-0085 の manual acceptance (issue #229) を実 issue で実施しようとした時点で、この緩和を残す判断を取り下げた。build に渡すのは Plan 節を持つ issue だけにする。

## Decision Drivers

- 実装対象を人間が検証した選択に限る (ADR-0085 の核)
- plan の質を決める判断 (unit 分割、test scenario) を issue 本文に集約し、build の内部に隠さない
- 停止は拒絶ではなく差し戻しなので、精緻化の経路 (`/think` から `/issue`) を stopped の why に載せる

## Considered Options

- Option A: draftPlan を削除し、Plan 節なしは stopped: no-plan で差し戻す (ADR-0085 の判断へ戻る)
- Option B: draftPlan を残し、生成 plan を人間の承認待ちにしてから Code へ進む
- Option C: 現状維持 (ADR-0086 のまま)

## Decision Outcome

Option A を採用する。build.js の draftPlan とその critic-design gate を削除し、`## Plan` 見出しが無い本文は Load 冒頭で stopped: no-plan を返す。why には、`/think` で設計して plan を下書きし、`/issue` で issue の `## Plan` 節へ転記してから build を再実行する経路を書く。Plan 節あり path (抽出、validate、id クロスチェック、UNIT_CAPS 検査) は変更しない。

Option B を退けた理由は、承認待ちが fire-and-forget を成立させないまま、build に生成経路の複雑さだけを残すこと。ADR-0086 が fire-and-forget のために置いた仕組みなので、承認を挟むなら仕組みごと持つ理由が消える。

ADR-0087 が draftPlan 経路に置いた UNIT_CAPS 超過時の再生成も、経路ごと退役する。extract 経路の UNIT_CAPS 決定論検査 (stopped: oversized-unit) は ADR-0087 のまま残る。

### Consequences

- Good, because 実装対象が人間の検証を経た選択だけになり、ADR-0085 の原則に例外が無くなる
- Good, because build.js から plan 生成 prompt と critic-design gate が消え、Load の分岐が 1 本になる
- Bad, because 雑な issue をそのまま build に流す使い方ができなくなる。Plan 節を書く工程が先に必要になる
- Bad, because `/slice` が生む Plan 節なし issue は、build に渡す前に `/think` と `/issue` を通す必要がある

### Confirmation

workflows/build/tests/build.behavior.test.js が、Plan 節なし本文で stopped: no-plan になり extract agent も plan 生成 agent も呼ばず Load 以外の phase へ進まないこと、why が `/think` と `/issue` を案内すること、stopped 値 snapshot が 13 値 (no-plan あり、plan-generation-failed と generated-plan-rejected なし) と exact match することを pin する。

## More Information

- ADR-0086 を supersede する。ADR-0085 が置いた no-plan 差し戻しへ戻す
- ADR-0087 のうち draftPlan 経路の再生成が併せて退役し、extract 経路の上限強制は残る
