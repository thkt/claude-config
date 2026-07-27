---
status: "superseded by 0089-retire-build-plan-drafting-and-hand-plan-less-issues-back.md"
date: 2026-07-14
decision-makers: thkt
---

# ADR-0086: Plan 節なし issue の plan を build 内で自律生成する

## Context and Problem Statement

ADR-0085 は build を選択ベース検証へ寄せ、その帰結として Plan 節の無い issue を stopped: no-plan で fail-close し、/think + /issue の精緻化を促す設計にした。運用してみると、状態 (goal) の書かれていない雑な issue をそのまま build に流したい場面が残る。build が自律的にゴールを設定し plan を起こして検証まで通せれば、精緻化の手戻りなしに fire-and-forget が成立する。

論点は生成の是非でなく生成処理の置き場になる。生成は build だけが使い、単独起動しない。workflow script は AsyncFunction の body として実行され (agent / phase / log は注入変数)、ES import できない。つまり別 workflow に切り出すと sibling() の名前解決経由になり、build 専用の処理が top-level workflow レジストリに登録されて単独起動できるように見えてしまう。

## Decision Drivers

- Plan 節なし issue でも fire-and-forget を成立させたい。ゴール未設定なら build が設定する
- ADR-0085 の選択ベース検証の核 (Verify / Cleanup / conformance) は維持する。変えるのは Load の plan 取得だけ
- 生成は build 専用で単独起動しない。top-level workflow として露出させない
- 生成 plan の状態目標は a11y 対応を含む (UI に触れる issue でキーボード操作性やスクリーンリーダー通知を criteria に入れる)

## Considered Options

- Option A: build.js Load 内のローカル関数 draftPlan にまとめる。Plan 節なしのとき呼ぶ
- Option B: 別の nested workflow draft-plan.js に切り出し、sibling("draft-plan") で呼ぶ
- Option C: fail-close を維持し、自律生成はしない (ADR-0085 のまま)

## Decision Outcome

Option A を採用する。build.js Load は Plan 節の有無で 2 分岐し、あり側は抽出 + id クロスチェック、なし側はローカル関数 draftPlan を呼ぶ。生成 plan も build.js の validate (canonical な構造 gate) を両ソース共通で通す。plan schema は 1 つ (PLAN_SCHEMA) を抽出と生成で共有する。

draftPlan の責務は、issue 本文からのリポジトリ探索 + plan 生成 (ゴール自律設定、a11y criteria 込み) と、人間未レビューを補う critic-design gate。NO-GO なら stopped: generated-plan-rejected、GO なら「自動生成で未レビュー」を assumptions 先頭に固定して plan を返す。critic が死んだ (null) 場合は fail-open。

Option B を退けた理由は、build 専用の処理が top-level workflow レジストリに登録され単独起動できるように見えること、schema が 2 ファイルに重複すること、ES import 不可でパス解決に頼ると plugin 配布が壊れること。

### Consequences

- Good, because Plan 節なし issue でも build が完走し、ゴール設定と検証まで自律で進む
- Good, because 生成が build 専用のローカル関数として閉じ、workflow レジストリに露出しない
- Good, because 抽出と生成で PLAN_SCHEMA を共有し、schema の重複が無い
- Bad, because 人間未レビューの生成 plan が軽い担保 (critic-design gate + 構造 validate) で Code へ進む。ADR-0085 の「検証済みの選択だけ実装する」原則を、生成 path に限って緩める
- Bad, because build.js が draftPlan の分だけ長くなる (名前付き関数で 1 箇所に閉じることで緩和する)

### Confirmation

workflows/build/tests/build.behavior.test.js が、Plan 節なし本文で generate-plan / critique-plan agent を Load 内で呼び Ship まで進むこと、critic-design NO-GO で stopped: generated-plan-rejected になること、stopped 値 snapshot が 10 値 (no-plan なし、plan-generation-failed / generated-plan-rejected あり) と exact match することを pin する。

## More Information

- ADR-0085 の no-plan 判断を改める (Amends ADR-0085)。選択ベース検証の核は維持する
- 生成 path の critic-design gate は Plan 節あり path の id クロスチェックに相当する安全機構
