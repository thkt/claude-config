---
status: "accepted"
date: "2026-08-02"
decision-makers: thkt
---

# DR-0095: audit の membership 判定を enhancer-integration の Phase 2 から script の triage に移す

## Context and Problem Statement

`agents/enhancers/enhancer-integration.md` は Phase 2 (Reconciliation、`agents/enhancers/enhancer-integration.md:68-79`) で challenger (critic-audit) と verifier (critic-evidence) の出力を finding_id で突き合わせ、6 段の優先順位表で confirmed/disputed/needs_review/needs_context を判定する設計だった。Input セクション (`agents/enhancers/enhancer-integration.md:20-62`) はこの判定に使う `challenges` 配列 (finding_id/verdict/reasoning/evidence) と `verifications` 配列 (finding_id/verdict/budget_exhausted/evidence) を受け取る形を文書化している。

Issue #298 の実測では、raw findings 79 件が final 13 件、34 件が 8 件、12 件が 3 件に減り 75-85% が消えていた (#298 記載の当時の行番号基準)。finding に id が無いため、この刈りの主因が Challenge か Integrate かを追跡できなかった。#298 の U-001 で `workflows/audit.js` に R-N id 付きの script 側 triage ループ (`rawFindings` を回して `verdictById` を引く箇所) を実装し、challenger の verdict のみで survivors/needs_context/no_verdict を決定するようにした。U-003 でさらに Integrate への入力を `survivorsInput` (`toCriticRef` による id/file/line/severity/summary のみの射影) に絞り、prompt に「Membership is already decided ... Do not re-cull, dispute, or drop any survivor; only merge and reorder them into root causes」を明記した。verifier (critic-evidence) の出力は `verified` として実行されるが Integrate には渡らず、`log()` で informational とだけ記録される。

この結果、enhancer-integration.md が文書化する Phase 1 (Receive) と Phase 2 (Reconciliation) は、`/audit` 経由の呼び出しでは実行されなくなった。Integrate に渡る `survivorsInput` は verdict/reasoning/evidence/budget_exhausted のいずれのフィールドも持たず、`challenges`/`verifications` という配列名も付かないため、Phase 2 が要求する突き合わせの対象そのものが入力に存在しない。enhancer-integration.md 自体は #298 のスコープ外 (Issue の Scope 節が挙げる「reviewer roster の retire と統合」は Backlog candidates 行き) として無改修のまま残り、この乖離はコードを読まないと分からない。

## Decision Drivers

- membership (survivor 判定) を script が 1 箇所で決定論的に持つほうが `workflows/polish.js` の triage ループと同型になり、判定基準が prompt の解釈に依存しない
- verifier の出力を Integrate に転送し Phase 2 の優先順位表で再判定させると、script の triage 結果と Phase 2 の判定が食い違う二重刈りのリスクが生まれる。#298 の Approach 節はこのリスクを名指しし、Manual verification 節も「二重刈りは prompt 文言でしか止められず、文言の存在を T-NNN で固定すると言い換えのたびに落ちる change detector になる」としてテストでなくコードレビューで確認する方針を取っている
- `agents/enhancers/enhancer-integration.md` の改修 (Phase 2 の削除や Input 定義の更新) は #298 の Scope 外。Backlog candidates が挙げる「reviewer roster の retire と統合の判断」の一部であり、単独 Issue の中で改修すると影響範囲が #298 の枠を超える
- 判定は外部から観測できる形だけで行う方針 (#298 Testing Decisions) により、prompt 文言を固定する test は置かない。Phase 2 が不使用になったこと自体は unit test でなく DR で記録する対象になる

## Considered Options

- Option A: `agents/enhancers/enhancer-integration.md` は無改修のまま残し、`workflows/audit.js` 側で Integrate への入力を triage 済みの survivors のみに絞り、再刈り禁止を prompt に明記する。Phase 2 が `/audit` 経由では実行されなくなる副作用を本 DR に記録する
- Option B: `agents/enhancers/enhancer-integration.md` を改修し、Phase 2 (Reconciliation) と Input セクションの `challenges`/`verifications` 形を削除して、Phase 3 (Integration) 相当の統合専任 agent として定義し直す
- Option C: script 側の triage を実装せず、Phase 2 の優先順位表に membership 判定を委ね続ける。Integrate には challenger と verifier の生の出力をそのまま転送する

## Decision Outcome

Option A を採用する。#298 の Scope は `workflows/audit.js` と `workflows/audit/tests/` に限定されており、`agents/enhancers/enhancer-integration.md` の改修は reviewer roster 全体の retire/統合判断と地続きで、単独では判断しきれない。script 側に triage を持たせる変更 (U-001, U-003) だけで #298 の Acceptance Criteria (verdict が snapshot に載る、R-N id が source_ids まで追える) を満たせるため、enhancer-integration.md には触れずに Integrate への入力を絞る形で二重刈りを止めた。

### Consequences

- Good, because membership 判定が `workflows/audit.js` の triage ループ 1 箇所に決定論的に集約され、`workflows/polish.js` と同型のパターンになる。判定基準の変更は script の 1 ファイルを読めば追える
- Good, because `agents/enhancers/enhancer-integration.md` を無改修のまま残せるため、#298 の作業が reviewer roster 全体の設計判断に波及しない
- Bad, because `agents/enhancers/enhancer-integration.md` の Phase 1 (Receive) と Phase 2 (Reconciliation)、その Input セクションが定義する `challenges`/`verifications` 形は、`/audit` 経由の呼び出しでは実行されない仕様になる。ファイルだけを読む人は、Integrate が challenger と verifier を突き合わせて needs_review 等を判定すると誤解する
- Bad, because Phase 2 の優先順位表が持っていた「challenger は disputed だが verifier が verified を返した」ケースの回収経路 (needs_review) が `/audit` の出力から失われる。verifier (critic-evidence) は実行されるが、その判定は `log()` の 1 行に残るのみで最終 findings に一切影響しない
- Bad, because enhancer-integration.md と audit.js の呼び出し形の乖離は自動テストで検出できない (#298 Testing Decisions が明記する方針)。コードレビューでの目視確認と本 DR が唯一の記録になる

### Confirmation

`workflows/audit.js` の Integrate 呼び出し prompt が「Membership is already decided」を含み、渡す入力 `survivorsInput` が id/file/line/severity/summary のみで verdict/reasoning/evidence を持たないことをコードレビューで確認する。`agents/enhancers/enhancer-integration.md` が無改修であることは `git diff main...HEAD -- agents/enhancers/enhancer-integration.md` が空であることで確認できる。

## More Information

- 上流の Issue は #298。本 DR は #298 の Plan の U-006 にあたり、triage の実装自体は U-001 (script 側 triage ループ) と U-003 (Integrate 入力の survivors 限定と再刈り禁止 prompt) が担う
- enhancer-integration.md の Phase 2 削除や reviewer roster 全体の retire/統合判断は、#298 の Backlog candidates に挙げた別判断として持ち越す
- 関連する既存 DR は DR-0035 (audit/verify の convergence signal と reconciliation の置き場所)。DR-0035 は `/verify` 側の reconciliation を enhancer-evidence に割り当てる判断をしており、`/audit` 側の enhancer-integration.md にも同型の Phase 2 (Reconciliation) が独立して存在する (`agents/enhancers/enhancer-evidence.md:70-82` と `agents/enhancers/enhancer-integration.md:68-79`)。両者の分岐の経緯は本 DR の調査範囲外である
- `docs/decisions/` は `.ja` ミラー対象外 (`.ja/docs/decisions/` は存在しない)。本 DR に対応する日本語ミラーの追補は不要

### Reassessment Triggers

- enhancer-integration.md の他の呼び出し元 (現状は `/audit` 以外に存在しない) が Phase 2 の Input 形をそのまま必要とする実装が現れたとき、Phase 2 を維持したまま呼び出し形を揃える判断が優勢になりうる
- verifier (critic-evidence) の execution-path evidence を membership 判定に使わないことが false negative (本来 disputed の finding が survivors に残る、または本来 confirmed の finding が消える) として実害化したとき、needs_review 相当の回収経路を script 側 triage に作り直す検討が要る
