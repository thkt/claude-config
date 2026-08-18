---
status: "accepted"
date: 2026-07-22
decision-makers: thkt
---

# ADR-0087: unit サイズ上限を build に決定論強制し、超過時は再生成 + fail-closed で処理する

## Context and Problem Statement

kizalas の build run (wf_0c631e1d、全体 10.7h) の実測で、Code phase が 90% (577m) を占めた。支配項は unit の粒度で、6-7 files の unit は実装 agent 1 体あたり 17-46m、U-010 (7 files) は green が 3 回走り計 240m に達した。/think Phase 3 は 2026-07-22 にテスト先行分解 + 書き出し前の数え上げ検査へ改修済みだが、これは instruction であって強制点ではない。さらに plan 無し issue の draftPlan 経路には上限が無く、当該 run はこの経路で 7 files の unit が素通りした。build.js の validate() は extract / draftPlan 両経路が通る唯一の共有点で、ここに機構ガードが無い限り肥大 unit は Code phase に到達する (issue #219)。

## Decision Drivers

- 肥大 unit を Code phase に到達させない。検出は決定論、書いた本人の instruction 遵守に頼らない
- extract 経路 (人間が書いた plan) と draftPlan 経路 (自律生成、ADR-0086) の両方に同じ上限を効かせる
- seam unit (境界跨ぎテスト) は files 増加が正当なため、検出対象から除く
- 上限値は /think Phase 3 の分解規則と同期させる。build.js の UNIT_CAPS だけが変わると、人間が書いた valid な plan が extract 経路で reject される

## Considered Options

- Option A: 超過 unit のみを分割 agent に再分解させる縮小ゲート (当初案)
- Option B: 決定論検出 + 経路別処理。extract 経路は即 stop、draftPlan 経路は feedback 付き再生成 1 回を挟んで fail-closed
- Option C: 上限超過を invalid-plan で即 stop する最小案 (draftPlan 経路にも再生成を挟まない)
- Option D: /think の instruction 強化のみで済ませ、build.js への機構追加を見送る

## Decision Outcome

Option B を採用する。UNIT_CAPS = { files: 3, tests: 4 } を build.js に定数化し、oversizedUnits(plan) を validate() とは別の決定論検出関数として追加した。seam: true の unit は検出対象外とする。extract 経路は id クロスチェック通過後に検出し、stopped: "oversized-unit" で即停止して /think Phase 3 の上限と /issue での plan 精緻化を why に案内する。draftPlan 経路は generate prompt に UNIT_CAPS を明記して予防し、超過検出時は超過 unit 一覧を feedback にして generate agent を 1 回だけ再実行する。再生成後も超過なら stopped: "oversized-unit" で fail-closed とする。draftPlan の T-NNN は生成直後で人間レビューを経ていないため、超過 unit だけを分割せず全体を再生成してよい。critique-plan の攻撃項目に unit 肥大を追加したが、肥大単独では NO-GO にしない。カウント超過は下流の oversizedUnits ゲートが処理するため、critic は size 以外の欠陥に絞る。

Option A (縮小ゲート) を却下した理由は、凝集で束ねた unit の肥大が絡み合いであり、決定論分割が原理的に保証できないことにある。unit は責務の凝集で束ねているため、肥大は不要なコードの寄せ集めではなく本質的な絡み合いであることが多い。最大の不可分 file 群に紐づく test 数がそもそも上限を超える不可分 unit では分割が原理的に失敗する。機械的な files 再配分は既存 T-NNN の対応関係を壊し (clobber)、直列実装順を破壊し、seam の意味 (境界跨ぎ検証という unit の存在理由) を劣化させる。これらを決定論の再検査だけで安全に守り切ることができないため、critic-design は NO-GO と判定した。

Option C (再生成なしの即 stop) を退けた理由は、draftPlan 経路には人間が書いた plan が無く、即 stop すると issue 本文からの再着手コストが extract 経路より高くなることにある。フィードバック付き再生成を 1 回挟むことで、生成側の欠陥をその場で正すコストを下げつつ、fail-closed の安全側は保つ。

Option D (instruction のみ) を退けた理由は、当該暴走 run がまさに instruction の効かない draftPlan 経路で起きたことにある。instruction は extract 経路の人間執筆者にしか作用せず、機構ガードの代替にならない。

### Consequences

- Good, because 肥大 unit が extract / draftPlan いずれの経路からも Code phase に到達しなくなり、Code phase 支配の暴走 run を機構的に防ぐ
- Good, because draftPlan 経路は即 stop でなく feedback 付き再生成 1 回を挟むため、人間の plan が無くても自律完走の機会を保つ
- Good, because seam unit を検出対象から除くことで、境界跨ぎテストの正当な files 増加を誤検出しない
- Bad, because UNIT_CAPS は build.js と skills/think/SKILL.md の 2 箇所に存在し、相互 import 不可のため機械的な single-source 化ができない。結合はコメント明記のみで守る (Backlog candidate)
- Bad, because extract 経路への自動縮小 (分割 / 再生成) は見送ったため、人間が書いた肥大 plan は stop 後の手動精緻化が必要になる。issue 本文と plan の対応維持を優先した判断

### Confirmation

workflows/build/tests/build.behavior.test.js が、extract 経路で files 4 つまたは tests 5 個の非 seam unit を含む plan が stopped: "oversized-unit" で停止すること、seam: true の unit と files 3 / tests 4 のちょうど上限値の plan は続行すること、draftPlan 経路で超過 plan が feedback 付きで generate agent を 1 回だけ再実行し、再生成後に上限内なら続行、なお超過なら stopped: "oversized-unit" になることを検証する。stopped 値 snapshot が 13 値 (oversized-unit を含む) と exact match することを pin する。

## More Information

- ADR-0086 の draftPlan 経路 (Load 内ローカル関数、単独起動しない) に UNIT_CAPS enforcement を追加する。ADR-0086 の生成 path を変えるものではない
- issue #219 に上限値・検出関数のシグネチャ・却下した Alternatives の詳細を記録
- 上限値変更時は skills/think/SKILL.md Phase 3 の上限規則と workflows/build.js の UNIT_CAPS を同一コミットで揃える (Premise、issue #219)

### Reassessment Triggers

- UNIT_CAPS と think の分解規則が乖離し、人間が書いた valid な plan が extract 経路で reject されたとき
- stop 後の手動精緻化が運用の負担になり、自動縮小を見送った判断が破れたとき
