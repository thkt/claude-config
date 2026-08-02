---
status: "accepted"
date: 2026-07-14
decision-makers: thkt
---

# ADR-0085: build の audit fan-out を選択ベース検証に置換する

## Context and Problem Statement

build.js は Code の後に audit (glob routing で最大 9 lens の reviewer → challenge → verify → integrate) ∥ polish review ∥ conformance を並列起動し、critical/high findings に対して fix → re-audit loop を回す。fire-and-forget の自律品質保証として設計されたが、issue 1 件の実装に対する動作としては過剰になった。

前提が 2 つ変わった。ADR-0084 で上流が人間駆動になり、plan は「生成でなく選択」の引用ベース contract (引用 1 行 + やりたいこと 1 行) と 1 行言明テスト (T-NNN) を持つ検証済み成果物になった。plan 自体が機械検証可能なアンカー (前提 path + stable anchor、files スコープ、T-NNN 言明、test_command) を揃えている。また security / silence 系の決定論で拾える部分は静的解析 (gates hooks の lint / type / test、clippy、oxlint、gitleaks) の領分で、LLM レビューの必要がない。

## Decision Drivers

- 正しさの担保を「事後の欠陥探索」から「plan の検証可能アンカーの決定論チェック」へ置き換えられる。選択された plan は検証済みだから軽く、が原則
- ADR-0084 と同じ動きの下流への適用。重い担保 (audit / polish review) は組み込み必須でなく、人間が PR に対して起動する段になる
- 実装は引用に従い (code.js は T-NNN の name をテスト名に逐語使用)、逸脱は決定論比較で検出できる
- 静的解析が構造的に届かないのはロジックレベルの欠陥のみで、そこは人間駆動の /audit が受け皿になる

## Considered Options

- Option A: build.js を light pipeline に全面置換。audit / polish review / fix loop を削除し、人間駆動の /audit へ完全分離
- Option B: build.js 内で Plan 節の有無により light / フル audit を分岐
- Option C: 現状維持で測定先行。audit findings のうち contract 逸脱に還元できる割合を実測してから間引く

## Decision Outcome

Option A を採用する。build.js は Load → Revalidate → Branch → Code → Verify → Ship の決定論パイプラインになる。

- Load: Plan 節の無い issue は stopped: no-plan で停止し、/think + /issue による精緻化を提案する。ephemeral plan 生成と critic-design gate は削除
- Verify (新設): 決定論検査 2 種。diff が plan の files に収まるかのスコープ検査と、T-NNN 言明がテスト名として逐語存在するかの照合 (verify-tests.py)。逸脱は fail-open で PR に surface する
- Conformance: reviewer-conformance 1 pass が唯一の LLM レビューとして残る
- Polish: cleanup mode (simplify → enhancer-code → test 検証) のみ残し、review mode (Codex lens) は外す
- Ship: PR body の fact tail から audit 節 (residual_blocking / reaudited) を外し、scope 逸脱 / 欠落テスト言明の節と「/audit は人間が必要と判断したら起動する」の案内を加える

### Consequences

- Good, because build が issue 1 件に対してシンプル・高速・安価になり、担保の重さが plan の信頼度に紐づく
- Good, because audit / polish は /audit / /polish としてそのまま残り、人間が必要な PR にだけ起動できる
- Bad, because ロジックレベルの欠陥 (認可の誤り、ビジネスルールの迂回) は人間が /audit を起動しない限り未検出になる。掛け忘れを止める機構はない
- Bad, because Plan 節なしの fire-and-forget が使えなくなる。雑な issue は /think + /issue の精緻化を先に要求される

### Confirmation

workflows/build/tests/build.behavior.test.js が phase 順 (Load → Revalidate → Branch → Code → Verify → Ship)、stopped 値 snapshot (no-plan を含む)、audit / critique 経路の不在をピンする。verify-tests.py は workflows/build/tests/verify_tests_test.py で検証する。

## More Information

- ADR-0084 (上流の人間駆動化) の下流への適用。ADR-0081 (fan-out は決定論 workflow へ) とは両立し、残る fan-out (code / polish cleanup) は workflow のまま
- 静的解析の言語別整理は memory reference_semgrep-gitleaks-by-language を参照
- 2026-08-02 に Ship の「`/audit` は人間が必要と判断したら起動する」案内を PR body から外した。tail を読むのは build を起動した本人であり、毎回同じ操作案内が並ぶ。build が深いレビューを含まないことは自動生成ラベルが持ち続ける。重い担保は人間が起動するという方針自体は変えていない
