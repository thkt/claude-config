# Research: E2Eテスト生成のワークフロー統合条件

Generated: 2026-03-21
Intent: Feature planning

## Purpose

現状のスキル/エージェント構成でE2Eテスト生成がワークフローに自然に組み込まれるための条件を整理し、既存のユニットテスト統合パターンとのギャップを特定する。

## Prerequisites

| Marker | Item                                                            | Evidence/Basis                                                                  |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [✓]    | /e2e スキルが存在する                                           | `skills/e2e/SKILL.md` - agent-browser経由のPlaywrightテスト生成                 |
| [✓]    | /code はgenerator-test経由でUT生成を自動化済み                  | `skills/code/SKILL.md:72` - Phase 0でbackground spawn                           |
| [✓]    | /feature のPhase 4.5にVisual Verificationがある                 | `skills/feature/SKILL.md:99-134` - agent-browser経由                            |
| [✓]    | generator-testはSpec T-NNN駆動で動く                            | `agents/generators/generator-test.md:35` - Spec必須                             |
| [✓]    | evaluator-testはT-NNN coverage計測済み                  | `agents/evaluators/evaluator-test.md` - 5メトリクス                     |
| [✓]    | litmus(ADR-0028)がテスト品質の静的検査を担う予定                | `adr/0028` - oxc_parser Rustバイナリ、Proposed                                  |
| [→]    | /e2eは/codeや/featureから自動起動されない                       | 現状は手動起動のみ。`/code`のExecution, `/feature`のPhase表に/e2eへの参照なし   |
| [→]    | E2Eテストのフレームワーク検出はgenerating-tdd-testsに含まれない | `generating-tdd-tests/SKILL.md:109-116` - Jest/Vitest/Bunのみ。Playwright未記載 |
| [?]    | agent-browserの安定性とPlaywrightテストの再現性                 | `.playwright-cli/`に大量のログ。安定性の定量データなし                          |

## Architecture Overview

### 現状のテスト生成フロー（UT）

```
/think → spec.md (FR-xxx, T-NNN)
  ↓
/code → Phase 0: generator-test (background)
  ↓         ↓
  ↓    skipped tests (T-NNN tagged)
  ↓         ↓
  ↓    RGRC cycle (Phase 1-N)
  ↓         ↓
  ↓    evaluator-test (score >= 70)
  ↓         ↓
  gates → lint/type/test/coverage
```

### 現状のE2Eフロー

```
/e2e (手動起動、単独)
  ↓
  AskUserQuestion (test name, start URL)
  ↓
  agent-browser → snapshot → click/fill → screenshot
  ↓
  Playwright spec.ts 生成
  ↓
  (終了。品質ゲートなし)
```

### /feature のVisual Verification

```
/feature Phase 4.5 (条件付き)
  ↓
  UI変更あり AND agent-browser installed AND dev server detected
  ↓
  agent-browser → screenshot → AC visual check
  ↓
  (確認のみ。テスト生成なし)
```

## Available Data

| Type  | Item                   | Note                                                                   |
| ----- | ---------------------- | ---------------------------------------------------------------------- |
| Skill | /e2e                   | agent-browser経由Playwrightテスト生成。手動起動のみ                    |
| Skill | /code                  | generator-test自動spawn。UT専用                                        |
| Skill | /feature               | Phase 4.5でVisual Verification。テスト生成なし                         |
| Skill | /test                  | generator-testのgap analysis起動。E2E scope選択可                      |
| Skill | generating-tdd-tests   | TDD方法論。Playwright未対応                                            |
| Agent | generator-test         | Spec T-NNN駆動。UT/integration/e2eのcountは出すが、e2e生成ロジックなし |
| Agent | evaluator-test | T-NNN coverage。E2Eテスト固有メトリクスなし                            |
| Tool  | agent-browser          | Playwright操作。/e2eと/feature Phase 4.5で使用                         |
| ADR   | 0028 (litmus)          | テスト品質静的検査。UT向け。E2E未考慮                                  |

## Constraints

| Category   | Constraint                                                   |
| ---------- | ------------------------------------------------------------ |
| Tool依存   | agent-browserがインストール済みであること                    |
| サーバ依存 | dev server が起動中であること（/featureと同じ制約）          |
| Spec依存   | E2EシナリオがSpec T-NNNとして定義されていること              |
| 実行時間   | E2Eはブラウザ操作のためUTより桁違いに遅い                    |
| 再現性     | ブラウザ状態・ネットワーク・タイミングによるflaky riskが高い |

## Key Findings

| Priority | Finding                                                                                                                                                                | Next Action                                                |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1        | [✓] UTの自動統合パターン（/code Phase 0）はE2Eに転用不可。generator-testはSpec → skip tests → RGRC前提だが、E2Eはブラウザ操作が必要でskip/activateパターンが成立しない | E2E専用の生成パターン設計が必要                            |
| 2        | [✓] /feature Phase 4.5（Visual Verification）がもっとも自然な統合ポイント。すでにagent-browser + dev server検出の条件分岐があり、ここにテスト生成を追加する拡張コストが最小  | Phase 4.5にPlaywrightテスト生成オプション追加を検討        |
| 3        | [→] /e2eスキルは単独起動のみで他スキルから呼ばれない「孤立スキル」。/codeや/featureのワークフローチェーンに組み込まれていない                                          | /featureからの自動呼び出し or Spec駆動の条件付き起動を設計 |
| 4        | [→] Spec T-NNN体系にE2Eシナリオが含まれていない。evaluator-testのcoverage計算にE2Eが反映されない                                                               | SpecにE2Eセクション（ET-NNN等）追加、evaluator拡張         |
| 5        | [→] generating-tdd-testsのFramework DetectionにPlaywrightが未登録。E2Eテストの方法論（page object, stable selector等）がTDDスキルに含まれない                          | generating-tdd-testsにPlaywright対応セクション追加         |
| 6        | [?] agent-browserの操作ログ（.playwright-cli/）が大量にあるが、テスト生成の成功率・flaky率の計測基盤がない                                                             | 生成テストのpass率を計測する仕組みが前提条件               |

## Disconfirmation Check

反論仮説:「E2Eテスト生成はワークフロー統合せず、/e2e手動起動のままで十分ではないか」

検証: /codeと/featureの設計思想を確認。/codeは「NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST」を掲げ、generator-testを自動spawnする。/featureはPhase 1-5で一気通貫を目指す。E2Eのみ手動は設計思想と矛盾する。ただし、E2Eの実行コスト（ブラウザ操作+flaky risk）を考慮すると、全自動ではなくオプトイン型（Specにe2eフラグ付きシナリオがある場合のみ起動）が妥当。

結論: 完全手動は設計思想と不整合だが、完全自動もコスト過大。オプトイン型が落としどころ。

## 統合に必要な条件（整理）

### 前提条件（Must）

| #   | 条件                          | 現状                       | Gap                    |
| --- | ----------------------------- | -------------------------- | ---------------------- |
| 1   | agent-browserインストール済み | /feature Phase 4.5と同条件 | なし                   |
| 2   | dev server起動中              | /feature Phase 4.5と同条件 | なし                   |
| 3   | SpecにE2Eシナリオ定義あり     | 未対応                     | ET-NNN体系の設計が必要 |

### 統合設計条件（Should）

| #   | 条件                                 | 現状                    | Gap                      |
| --- | ------------------------------------ | ----------------------- | ------------------------ |
| 4   | /feature Phase 4.5からの自動起動パス | Visual Verificationのみ | テスト生成ステップ追加   |
| 5   | generating-tdd-testsのPlaywright対応 | Jest/Vitest/Bunのみ     | E2Eセクション追加        |
| 6   | evaluator-testのE2E対応      | UT T-NNN計測のみ        | ET-NNN対応拡張           |
| 7   | 生成テストのflaky検出                | なし                    | 初回実行pass率の閾値設定 |

### 品質保証条件（Could）

| #   | 条件                                  | 現状                                  | Gap                               |
| --- | ------------------------------------- | ------------------------------------- | --------------------------------- |
| 8   | litmus(ADR-0028)のE2E対応             | UT向けweak-assertion/mock-overuse     | E2E固有ルール（flaky pattern等）  |
| 9   | /auditのE2Eテストファイルルーティング | test.\*パターンでreviewer-testability | E2E専用reviewer不要（既存で十分） |

## References

| Path                                                                   | Description                            |
| ---------------------------------------------------------------------- | -------------------------------------- |
| `~/.claude/skills/e2e/SKILL.md`                                        | E2Eテスト生成スキル定義                |
| `~/.claude/skills/code/SKILL.md`                                       | /code実装スキル（generator-test統合）  |
| `~/.claude/skills/feature/SKILL.md`                                    | /feature Phase 4.5 Visual Verification |
| `~/.claude/agents/generators/generator-test.md`                        | テスト生成エージェント定義             |
| `~/.claude/agents/evaluators/evaluator-test.md`                | テスト品質評価エージェント             |
| `~/.claude/skills/generating-tdd-tests/SKILL.md`                       | TDD方法論スキル                        |
| `~/.claude/skills/orchestrating-workflows/SKILL.md`                    | ワークフロー定義                       |
| `~/.claude/skills/orchestrating-workflows/references/code-workflow.md` | /codeワークフロー詳細                  |
| `~/.claude/adr/0028-build-test-quality-gate-with-oxc-parser.md`        | litmus ADR                             |

## Next Steps

| Intent           | Next Command |
| ---------------- | ------------ |
| Feature planning | `/think`     |
