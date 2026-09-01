# Decision Records

This directory contains important decisions about the project.

## DR List

| Number | Title | Status | Date |
|--------|-------|--------|------|
| [0001](0001-code-command-responsibility-separation.md) | ADR 0001: code.md コマンドの責任分離 | accepted | 2025-12-16 |
| [0002](0002-fix-modularization-and-tdd-commonization.md) | ADR 0002: /fix モジュール化とTDD共通化 | accepted | 2025-12-24 |
| [0003](0003-marketplace.md) | Marketplace構造の維持 | superseded by DR-0083 | 2026-01-03 |
| [0004](0004-skill-centric-architecture-restructuring.md) | ADR 0004: スキル中心アーキテクチャへの再構成 | accepted | Not set |
| [0005](0005-documentation-role-separation.md) | ADR-0005: ドキュメントの役割分離とAI最適化 | accepted | Not set |
| [0006](0006-adopt-deterministic-script-pattern.md) | Adopt Deterministic Script Pattern | superseded by DR-0042 | 2026-01-27 |
| [0007](0007-configuration-optimization.md) | ADR-0007: Claude Code 設定の最適化 | proposed | Not set |
| [0008](0008-audience-optimized-templates.md) | ADR-0008: 読み手別テンプレート最適化の採用 | accepted | Not set |
| [0009](0009-externalize-idr-as-rust-binary.md) | IDR生成システムの外部リポジトリ化（Rustバイナリ） | accepted | 2026-02-07 |
| [0010](0010-schema-first-api-documentation.md) | Schema-First API ドキュメント生成と Dual Output | accepted | 2026-02-08 |
| [0011](0011-add-evidence-verifier-to-audit-pipeline.md) | Audit パイプラインに Evidence Verifier を追加 | accepted | 2026-02-10 |
| [0012](0012-flatten-audit-pipeline-remove-compound-reviewers.md) | ADR-0012: Flatten Audit Pipeline - Remove Compound Reviewers | accepted | Not set |
| [0013](0013-adopt-hook-trinity-pattern-with-claude-reviews.md) | ADR-0013: Hook Trinity パターンの採用 - claude-reviews による Pre-flight 分析の確実な実行 | accepted | Not set |
| [0014](0014-integrate-aidlc-design-separation-and-ops-reviewer.md) | ADR-0014: AI-DLC 統合 - 設計分離と Operational Readiness Reviewer | accepted | Not set |
| [0015](0015-frontend-security-guardrails-strategy.md) | Adopt Pattern-Match + Taint-Checklist Strategy for Frontend Security | accepted | 2026-02-23 |
| [0016](0016-adopt-rust-mcp-for-deep-search.md) | ADR-0016: Adopt Rust + rmcp for deep-search MCP Server | proposed | 2026-02-25 |
| [0017](0017-build-frontend-code-search-mcp-in-rust.md) | ADR-0017: Build frontend-specialized code search MCP server in Rust | proposed | 2026-02-26 |
| [0018](0018-index-time-file-context-storage-for-explorer.md) | explorer のファイル文脈に Index-time storage を採用 | accepted | 2026-02-27 |
| [0019](0019-adopt-sqlite-reference-graph-for-impact-analysis.md) | Adopt SQLite Reference Graph for Impact Analysis | proposed | 2026-02-27 |
| [0020](0020-claude-code-dashboard-tech-stack.md) | ADR-0020: kagami - 技術スタックと収集方式の選定 | accepted | Not set |
| [0021](0021-build-slack-semantic-search-mcp-kiku.md) | ADR-0021: Build Slack conversation semantic search MCP server (kiku) | proposed | 2026-03-03 |
| [0022](0022-migrate-yomu-from-mcp-to-cli.md) | ADR-0022: Migrate yomu from MCP server to CLI tool | proposed | 2026-03-04 |
| [0023](0023-build-sharpen-rg-output-optimizer-for-ai.md) | ADR-0023: Build sharpen - rg output optimizer for AI consumption | proposed | 2026-03-05 |
| [0024](0024-adopt-two-layer-delta-for-compaction-resilience.md) | ADR-0024: Adopt two-layer Delta for compaction resilience | accepted | 2026-03-10 |
| [0025](0025-retire-ralph-loop-adopt-native-goal.md) | ADR-0025: ralph-loop を退役しネイティブ /goal を採用 | accepted | 2026-05-31 |
| [0026](0026-recognize-spec-code-convergence-in-llm-instructions.md) | ADR-0026: LLM指示設計における仕様-コード収束則を認識する | accepted | 2026-03-20 |
| [0027](0027-centralize-plugin-definitions-in-sentinels.md) | ADR-0027: プラグイン定義を sentinels リポに集約する | proposed | 2026-03-20 |
| [0028](0028-build-test-quality-gate-with-oxc-parser.md) | ADR 0028: oxc_parser によるテスト品質ゲート litmus の構築 | proposed | 2026-03-20 |
| [0029](0029-integrate-e2e-test-generation-into-spec-driven-workflow.md) | ADR 0029: Spec 駆動 E2E テスト生成のワークフロー統合 | superseded by DR-0082 | 2026-07-05 |
| [0030](0030-build-session-monitor-tui-mado.md) | ADR 0030: Claude Code セッション監視 TUI mado の構築 | proposed | 2026-03-22 |
| [0031](0031-adopt-local-embedding-ort-ruri-v3.md) | ADR-0031: ort + Ruri v3 によるローカル embedding 基盤の構築 | proposed | 2026-03-22 |
| [0032](0032-build-esa-semantic-search-cli-sae.md) | ADR-0032: Build esa semantic search CLI (sae) | proposed | 2026-03-23 |
| [0033](0033-add-recursive-unwrap-stack-to-shields.md) | ADR-0033: shields に Recursive Unwrap Stack を追加 | proposed | 2026-03-24 |
| [0034](0034-automate-backlog-lifecycle-with-remote-trigger.md) | ADR-0034: LaunchAgent によるバックログライフサイクル自動化 | deprecated | 2026-03-24 |
| [0035](0035-audit-verify-convergence-signal-and-reconciliation-ownership.md) | Record convergence signals in audit/verify dedup and move reconciliation into enhancer-evidence | accepted | 2026-04-04 |
| [0036](0036-build-llm-wiki-plugin-for-cross-session-knowledge-synthesis.md) | LLMによるクロスセッション知識合成wikiプラグインの構築 | deprecated | 2026-04-07 |
| [0037](0037-align-sae-filter-helpers-for-amici-extraction.md) | ADR-0037: sae フィルタヘルパーを amici 抽出前提で yomu パターンに揃える | accepted | 2026-04-10 |
| [0038](0038-add-stencils-as-sixth-posttooluse-hook-for-pattern-cataloging.md) | ADR-0038: hook pipelineに stencils を追加しコードパターンをカタログ化する | proposed | 2026-04-13 |
| [0039](0039-add-tempos-pretooluse-tdd-hook-with-litmus-library-integration.md) | ADR-0039: PreToolUse hook に tempos を追加し litmus library 統合で TDD リズムを強制する | proposed | 2026-04-13 |
| [0040](0040-wiki-plugin-v2-global-mode-and-publish-layer.md) | wiki plugin v2: グローバルモード・publish 層・wiki_root リゾルバーの導入 | accepted | 2026-04-14 |
| [0041](0041-fork-strategy-for-carte.md) | ADR-0041: carte を CCPlanView からフォークする運用方針 | proposed | 2026-04-19 |
| [0042](0042-colocate-skill-specific-scripts-within-skill.md) | ADR-0042: Colocate Skill-Specific Scripts Within Skill Directory | accepted | 2026-04-20 |
| [0043](0043-normalize-findings-in-audit-multi-run-aggregation.md) | Normalize findings in audit multi-run aggregation with line and category tolerance | accepted | 2026-04-20 |
| [0044](0044-reject-snapshot-aware-audit-pipeline.md) | Reject snapshot-aware audit pipeline in favor of multi-run aggregation | rejected | 2026-04-20 |
| [0045](0045-replace-scout-skill-with-scout-search-cli-wrapper.md) | Replace /scout skill with scout-search CLI wrapper, retire scouting-anomalies | accepted | 2026-04-20 |
| [0046](0046-colocate-audit-templates-in-skill-references.md) | Colocate audit assets under skills/audit with references and templates split | accepted | 2026-04-20 |
| [0047](0047-adopt-snapshot-as-canonical-with-rendered-output.md) | Adopt snapshot as canonical source with rendered Markdown output for audit reports | accepted | 2026-04-20 |
| [0048](0048-standardize-generator-skill-structure.md) | Adopt unified SKILL.md template for generator-class workflows | accepted | 2026-04-21 |
| [0049](0049-consolidate-skill-to-skill-wrapper-pairs.md) | ADR-0049: Consolidate skill-to-skill wrapper pairs | accepted | 2026-04-21 |
| [0050](0050-consolidate-fix-via-skill-delegation.md) | ADR-0050: Consolidate /fix via skill delegation; retire fix-workflow.md | accepted | 2026-04-21 |
| [0051](0051-consolidate-formatting-audits-into-sow-spec-reviewer.md) | ADR-0051: Consolidate formatting-audits skill into reviewer-spec agent | accepted | 2026-04-23 |
| [0052](0052-unify-skill-naming-with-use-prefix-for-cli-wrappers.md) | ADR-0052: Unify skill naming with `use-*` prefix for CLI wrapper skills | superseded by DR-0055 | 2026-04-23 |
| [0053](0053-adopt-ctx-prefix-for-agent-only-skills.md) | Adopt ctx- prefix for agent-only skills | superseded by DR-0055 | 2026-04-24 |
| [0054](0054-adopt-workflow-prefix-for-workflow-skills.md) | Adopt workflow- prefix for workflow skills | superseded by DR-0055 | 2026-04-24 |
| [0055](0055-consolidate-user-invocable-false-skills-under-use-prefix.md) | ADR-0055: Consolidate user-invocable:false skills under unified use- prefix with role subcategories | accepted | 2026-04-24 |
| [0056](0056-remove-redundant-cli-wrapper-skills.md) | ADR-0056: Remove redundant CLI wrapper skills (use-cli-git/gh/npm) | accepted | 2026-04-29 |
| [0057](0057-make-evaluator-test-a-pure-measurement-agent.md) | Make evaluator-test a Pure Measurement Agent | deprecated | 2026-05-01 |
| [0058](0058-inline-single-consumer-agent-context-skills-into-agents.md) | Inline single-consumer agent context skills into agents | accepted | 2026-05-01 |
| [0059](0059-adopt-tier-3-lite-github-label-strategy.md) | Adopt Tier 3 lite GitHub label strategy across personal projects | accepted | 2026-05-02 |
| [0060](0060-adopt-agent-friendly-cli-design-principles.md) | Adopt Agent-Friendly CLI Design Principles | accepted | 2026-05-03 |
| [0061](0061-adopt-meta-edit-declaration-pattern-as-a-new-sentinel.md) | Adopt meta-edit declaration pattern as a new sentinel | accepted | 2026-05-03 |
| [0062](0062-replace-absolute-coverage-thresholds-with-delta-based-gate.md) | Replace absolute coverage thresholds with delta-based gate | accepted | 2026-05-06 |
| [0063](0063-split-reviewer-design-into-deletion-test-and-react-pattern.md) | Split reviewer-design into deletion test and react-pattern | accepted | 2026-05-07 |
| [0064](0064-adopt-always-rerun-pre-commit-gate-for-silent-commit-prevention.md) | Adopt always-rerun pre-commit gate for silent commit prevention | proposed | 2026-05-07 |
| [0065](0065-scout-json-output-schema-and-sysexits-exit-code-policy.md) | scout JSON output schema and sysexits exit code policy | accepted | 2026-05-07 |
| [0066](0066-cli-exit-code-policy-grouped-by-error-topology.md) | CLI exit code policy grouped by error topology | accepted | 2026-05-13 |
| [0067](0067-define-boundary-between-rules-adr-and-claudemd.md) | Define boundary between RULES, ADR, and CLAUDE.md | superseded by DR-0106 | 2026-08-25 |
| [0068](0068-stop-hook-knowledge-reflection-subagent-and-mechanical.md) | Adopt Stop hook Knowledge Reflection with subagent extraction and mechanical activity log | deprecated | 2026-05-14 |
| [0069](0069-adopt-yomu-indirect-prompt-injection-defense.md) | Adopt Indirect Prompt Injection Defense Design for yomu | accepted | 2026-05-19 |
| [0070](0070-rename-audit-undocumented-skill-to-audit-adr-gaps.md) | ADR-0070: Rename audit-undocumented skill to audit-adr-gaps | superseded by DR-0075 | 2026-06-13 |
| [0071](0071-think-assert-no-source-enforcement.md) | ADR-0071: think と assert の no-source 状態の統一原則と enforcement 非対称 | accepted | 2026-06-01 |
| [0072](0072-discontinue-yomu-and-unify-code-search-on-ugrep.md) | ADR-0072: yomu 利用停止とコード検索の ugrep/bfs 統一 | accepted | 2026-06-09 |
| [0073](0073-adopt-ja-as-canonical-source-for-mirror.md) | ADR-0073: .ja を意図の正とするミラー運用への転換 | accepted | 2026-06-10 |
| [0074](0074-consolidate-adr-templates-into-a-single-madr-template.md) | ADR-0074: ADR テンプレートの単一 MADR テンプレートへの統合 | accepted | 2026-06-11 |
| [0075](0075-rename-adr-audit-skills-to-adrift-and-census.md) | ADR-0075: Rename audit-adr-drift to adrift and audit-adr-gaps to census | accepted | 2026-06-13 |
| [0076](0076-adopt-source-driven-discipline-for-framework-code.md) | ADR-0076: framework コードの source-driven discipline 採用 | accepted | 2026-06-18 |
| [0077](0077-finding-id-routing-and-audit-fix-loop-closure.md) | ADR-0077: fix の finding ID routing を severity で gate し audit→fix ループを閉じる | superseded by DR-0099 | 2026-08-18 |
| [0078](0078-align-finding-atom-family-on-audit-finding-schema.md) | ADR-0078: finding atom family を audit finding-schema の共通コアに揃える | accepted | 2026-06-19 |
| [0079](0079-purify-polish-to-external-cli-cleanup-and-fix-audit-boundary.md) | ADR-0079: polish を Codex + cleanup へ純化し audit との境界を確定する | accepted | 2026-06-23 |
| [0080](0080-design-workflow-outcome-evaluation-instrument-first.md) | ADR-0080: skill/workflow 成果の評価を instrument-first で設計する | accepted | 2026-06-24 |
| [0081](0081-move-machinery-fan-out-from-skill-prose-to-deterministic-workflow.md) | ADR-0081: machinery の fan-out を skill prose から決定論 workflow へ移す | accepted | 2026-07-01 |
| [0082](0082-retire-generator-e2e-agent.md) | ADR 0082: generator-e2e エージェントの廃止 | accepted | 2026-07-05 |
| [0083](0083-collapse-marketplace-to-single-build-plugin.md) | Marketplace を単一 build plugin に集約する | accepted | 2026-07-07 |
| [0084](0084-retire-issue-gate-and-hand-issue-flow-orchestration-to-human.md) | ADR-0084: issue-gate を廃止し issue フローのオーケストレーションを人間に返す | accepted | 2026-07-13 |
| [0085](0085-replace-builds-audit-fan-out-with-selection-based-verification.md) | ADR-0085: build の audit fan-out を選択ベース検証に置換する | accepted | 2026-07-14 |
| [0086](0086-draft-plans-for-plan-less-issues-in-build.md) | ADR-0086: Plan 節なし issue の plan を build 内で自律生成する | superseded by DR-0089 | 2026-07-14 |
| [0087](0087-enforce-unit-size-caps-with-regeneration-in-build.md) | ADR-0087: unit サイズ上限を build に決定論強制し、超過時は再生成 + fail-closed で処理する | accepted | 2026-07-22 |
| [0088](0088-commit-each-unit-in-build-with-plan-anchors-as-trailers.md) | ADR-0088: build の実装を unit ごとにコミットし、plan のアンカーを trailer に載せる | accepted | 2026-07-25 |
| [0089](0089-retire-build-plan-drafting-and-hand-plan-less-issues-back.md) | ADR-0089: Plan 節なし issue の plan 自律生成をやめ、build は issue へ差し戻す | accepted | 2026-07-27 |
| [0090](0090-unify-workspace-and-history-storage-locations.md) | Unify workspace and history storage locations | accepted | 2026-07-28 |
| [0091](0091-adopt-flat-index-reference-injection-for-workflows.md) | ADR-0091: リファレンス注入をフラットインデックスと glob 照合で決定的に行う | superseded by DR-0103 | 2026-07-28 |
| [0092](0092-place-tests-only-on-the-english-side.md) | DR-0092: テストを英語側のみに置き `.ja/` から外す | accepted | 2026-07-29 |
| [0093](0093-split-reference-module-null-into-kinds.md) | DR-0093: reference_module の null を kind (module/no-module/new-shape) に分ける | accepted | 2026-07-30 |
| [0094](0094-require-root-cause-for-bug-plans.md) | DR-0094: Bug の plan に root_cause を要求する判定を title のプレフィックスで行う | accepted | 2026-07-31 |
| [0095](0095-move-audit-membership-rule-from-agent-to-script.md) | DR-0095: audit の membership 判定を enhancer-integration の Phase 2 から script の triage に移す | accepted | 2026-08-02 |
| [0096](0096-fence-untrusted-findings-in-four-audit-stages.md) | DR-0096: audit の prompt data 境界を Challenge/Verify/Integrate/Snapshot の 4 段に絞る | accepted | 2026-08-03 |
| [0097](0097-ask-instead-of-extract-when-returning-corrections-to-rules.md) | Ask instead of extract when returning corrections to rules | deprecated | 2026-08-09 |
| [0098](0098-adopt-usage-census-over-time-based-prediction-ledger.md) | ADR-0098: 機構の退役判断に時間ベースの予測台帳ではなく使用センサスを採る | accepted | 2026-08-13 |
| [0099](0099-retire-fix-finding-id-route-for-direct-finding-input.md) | Retire fix's Finding ID route in favor of Direct Finding Input | accepted | 2026-08-18 |
| [0100](0100-replace-5-whys-with-hypothesis-elimination-in-rca.md) | Replace 5 Whys with hypothesis elimination in root cause analysis | accepted | 2026-08-18 |
| [0101](0101-extract-shared-embedding-crate-ruri-core.md) | embedding + storage ユーティリティの共有クレート化 (rurico) | proposed | 2026-03-24 |
| [0102](0102-resolve-uncertainty-at-issue-creation-instead-of-marking-it.md) | Resolve uncertainty at issue creation instead of marking it | accepted | 2026-08-19 |
| [0103](0103-carry-reference-rules-in-the-plan-instead-of-a-flat-index.md) | Carry reference rules in the plan instead of a flat index | accepted | 2026-08-20 |
| [0104](0104-keep-disposition-out-of-audit-gates.md) | Keep disposition out of audit gates | accepted | 2026-08-21 |
| [0105](0105-require-argsrepo-in-every-workflow.md) | Require args.repo in every workflow | accepted | 2026-08-23 |
| [0106](0106-adopt-the-wiki-as-the-current-state-view-over-immutable-drs.md) | Adopt the wiki as the current-state view over immutable DRs | accepted | 2026-08-24 |
| [0107](0107-track-research-reports-in-git-while-the-rest-of-the-workspace-stays-untracked.md) | Track research reports in git while the rest of the workspace stays untracked | accepted | 2026-08-26 |
| [0108](0108-grant-ast-grep-only-to-write-capable-agents.md) | Grant ast-grep only to write-capable agents | accepted | 2026-08-27 |
| [0109](0109-keep-the-scope-tag-and-retire-the-cluster-promotion-rule.md) | Keep the scope tag and retire the cluster-promotion rule | proposed | 2026-08-27 |
| [0110](0110-keep-workflow-enums-in-meta-as-derived-copy.md) | Keep workflow enums in meta as a derived copy | accepted | 2026-08-28 |
| [0111](0111-adopt-apple-container-for-agent-sandbox.md) | Adopt Apple container for agent sandbox | accepted | 2026-08-28 |
| [0112](0112-adopt-typescript-for-helper-scripts.md) | Adopt TypeScript for helper scripts | proposed | 2026-08-29 |
| [0113](0113-ban-bun-branded-identifiers-in-typescript-sources.md) | Ban bun-branded identifiers in TypeScript sources | accepted | 2026-09-01 |
| [0114](0114-justify-the-hooks-typescript-migration-by-the-type-contract.md) | Justify the hooks TypeScript migration by the type contract | proposed | 2026-09-01 |

## By Status

### Proposed

- **0007**: ADR-0007: Claude Code 設定の最適化
- **0016**: ADR-0016: Adopt Rust + rmcp for deep-search MCP Server
- **0017**: ADR-0017: Build frontend-specialized code search MCP server in Rust
- **0019**: Adopt SQLite Reference Graph for Impact Analysis
- **0021**: ADR-0021: Build Slack conversation semantic search MCP server (kiku)
- **0022**: ADR-0022: Migrate yomu from MCP server to CLI tool
- **0023**: ADR-0023: Build sharpen - rg output optimizer for AI consumption
- **0027**: ADR-0027: プラグイン定義を sentinels リポに集約する
- **0028**: ADR 0028: oxc_parser によるテスト品質ゲート litmus の構築
- **0030**: ADR 0030: Claude Code セッション監視 TUI mado の構築
- **0031**: ADR-0031: ort + Ruri v3 によるローカル embedding 基盤の構築
- **0032**: ADR-0032: Build esa semantic search CLI (sae)
- **0033**: ADR-0033: shields に Recursive Unwrap Stack を追加
- **0038**: ADR-0038: hook pipelineに stencils を追加しコードパターンをカタログ化する
- **0039**: ADR-0039: PreToolUse hook に tempos を追加し litmus library 統合で TDD リズムを強制する
- **0041**: ADR-0041: carte を CCPlanView からフォークする運用方針
- **0064**: Adopt always-rerun pre-commit gate for silent commit prevention
- **0101**: embedding + storage ユーティリティの共有クレート化 (rurico)
- **0109**: Keep the scope tag and retire the cluster-promotion rule
- **0112**: Adopt TypeScript for helper scripts
- **0114**: Justify the hooks TypeScript migration by the type contract

### Accepted

- **0001**: ADR 0001: code.md コマンドの責任分離
- **0002**: ADR 0002: /fix モジュール化とTDD共通化
- **0004**: ADR 0004: スキル中心アーキテクチャへの再構成
- **0005**: ADR-0005: ドキュメントの役割分離とAI最適化
- **0008**: ADR-0008: 読み手別テンプレート最適化の採用
- **0009**: IDR生成システムの外部リポジトリ化（Rustバイナリ）
- **0010**: Schema-First API ドキュメント生成と Dual Output
- **0011**: Audit パイプラインに Evidence Verifier を追加
- **0012**: ADR-0012: Flatten Audit Pipeline - Remove Compound Reviewers
- **0013**: ADR-0013: Hook Trinity パターンの採用 - claude-reviews による Pre-flight 分析の確実な実行
- **0014**: ADR-0014: AI-DLC 統合 - 設計分離と Operational Readiness Reviewer
- **0015**: Adopt Pattern-Match + Taint-Checklist Strategy for Frontend Security
- **0018**: explorer のファイル文脈に Index-time storage を採用
- **0020**: ADR-0020: kagami - 技術スタックと収集方式の選定
- **0024**: ADR-0024: Adopt two-layer Delta for compaction resilience
- **0025**: ADR-0025: ralph-loop を退役しネイティブ /goal を採用
- **0026**: ADR-0026: LLM指示設計における仕様-コード収束則を認識する
- **0035**: Record convergence signals in audit/verify dedup and move reconciliation into enhancer-evidence
- **0037**: ADR-0037: sae フィルタヘルパーを amici 抽出前提で yomu パターンに揃える
- **0040**: wiki plugin v2: グローバルモード・publish 層・wiki_root リゾルバーの導入
- **0042**: ADR-0042: Colocate Skill-Specific Scripts Within Skill Directory
- **0043**: Normalize findings in audit multi-run aggregation with line and category tolerance
- **0045**: Replace /scout skill with scout-search CLI wrapper, retire scouting-anomalies
- **0046**: Colocate audit assets under skills/audit with references and templates split
- **0047**: Adopt snapshot as canonical source with rendered Markdown output for audit reports
- **0048**: Adopt unified SKILL.md template for generator-class workflows
- **0049**: ADR-0049: Consolidate skill-to-skill wrapper pairs
- **0050**: ADR-0050: Consolidate /fix via skill delegation; retire fix-workflow.md
- **0051**: ADR-0051: Consolidate formatting-audits skill into reviewer-spec agent
- **0055**: ADR-0055: Consolidate user-invocable:false skills under unified use- prefix with role subcategories
- **0056**: ADR-0056: Remove redundant CLI wrapper skills (use-cli-git/gh/npm)
- **0058**: Inline single-consumer agent context skills into agents
- **0059**: Adopt Tier 3 lite GitHub label strategy across personal projects
- **0060**: Adopt Agent-Friendly CLI Design Principles
- **0061**: Adopt meta-edit declaration pattern as a new sentinel
- **0062**: Replace absolute coverage thresholds with delta-based gate
- **0063**: Split reviewer-design into deletion test and react-pattern
- **0065**: scout JSON output schema and sysexits exit code policy
- **0066**: CLI exit code policy grouped by error topology
- **0069**: Adopt Indirect Prompt Injection Defense Design for yomu
- **0071**: ADR-0071: think と assert の no-source 状態の統一原則と enforcement 非対称
- **0072**: ADR-0072: yomu 利用停止とコード検索の ugrep/bfs 統一
- **0073**: ADR-0073: .ja を意図の正とするミラー運用への転換
- **0074**: ADR-0074: ADR テンプレートの単一 MADR テンプレートへの統合
- **0075**: ADR-0075: Rename audit-adr-drift to adrift and audit-adr-gaps to census
- **0076**: ADR-0076: framework コードの source-driven discipline 採用
- **0078**: ADR-0078: finding atom family を audit finding-schema の共通コアに揃える
- **0079**: ADR-0079: polish を Codex + cleanup へ純化し audit との境界を確定する
- **0080**: ADR-0080: skill/workflow 成果の評価を instrument-first で設計する
- **0081**: ADR-0081: machinery の fan-out を skill prose から決定論 workflow へ移す
- **0082**: ADR 0082: generator-e2e エージェントの廃止
- **0083**: Marketplace を単一 build plugin に集約する
- **0084**: ADR-0084: issue-gate を廃止し issue フローのオーケストレーションを人間に返す
- **0085**: ADR-0085: build の audit fan-out を選択ベース検証に置換する
- **0087**: ADR-0087: unit サイズ上限を build に決定論強制し、超過時は再生成 + fail-closed で処理する
- **0088**: ADR-0088: build の実装を unit ごとにコミットし、plan のアンカーを trailer に載せる
- **0089**: ADR-0089: Plan 節なし issue の plan 自律生成をやめ、build は issue へ差し戻す
- **0090**: Unify workspace and history storage locations
- **0092**: DR-0092: テストを英語側のみに置き `.ja/` から外す
- **0093**: DR-0093: reference_module の null を kind (module/no-module/new-shape) に分ける
- **0094**: DR-0094: Bug の plan に root_cause を要求する判定を title のプレフィックスで行う
- **0095**: DR-0095: audit の membership 判定を enhancer-integration の Phase 2 から script の triage に移す
- **0096**: DR-0096: audit の prompt data 境界を Challenge/Verify/Integrate/Snapshot の 4 段に絞る
- **0098**: ADR-0098: 機構の退役判断に時間ベースの予測台帳ではなく使用センサスを採る
- **0099**: Retire fix's Finding ID route in favor of Direct Finding Input
- **0100**: Replace 5 Whys with hypothesis elimination in root cause analysis
- **0102**: Resolve uncertainty at issue creation instead of marking it
- **0103**: Carry reference rules in the plan instead of a flat index
- **0104**: Keep disposition out of audit gates
- **0105**: Require args.repo in every workflow
- **0106**: Adopt the wiki as the current-state view over immutable DRs
- **0107**: Track research reports in git while the rest of the workspace stays untracked
- **0108**: Grant ast-grep only to write-capable agents
- **0110**: Keep workflow enums in meta as a derived copy
- **0111**: Adopt Apple container for agent sandbox
- **0113**: Ban bun-branded identifiers in TypeScript sources

### Deprecated

- **0034**: ADR-0034: LaunchAgent によるバックログライフサイクル自動化
- **0036**: LLMによるクロスセッション知識合成wikiプラグインの構築
- **0057**: Make evaluator-test a Pure Measurement Agent
- **0068**: Adopt Stop hook Knowledge Reflection with subagent extraction and mechanical activity log
- **0097**: Ask instead of extract when returning corrections to rules

### Superseded

- **0003**: Marketplace構造の維持
- **0006**: Adopt Deterministic Script Pattern
- **0029**: ADR 0029: Spec 駆動 E2E テスト生成のワークフロー統合
- **0052**: ADR-0052: Unify skill naming with `use-*` prefix for CLI wrapper skills
- **0053**: Adopt ctx- prefix for agent-only skills
- **0054**: Adopt workflow- prefix for workflow skills
- **0067**: Define boundary between RULES, ADR, and CLAUDE.md
- **0070**: ADR-0070: Rename audit-undocumented skill to audit-adr-gaps
- **0077**: ADR-0077: fix の finding ID routing を severity で gate し audit→fix ループを閉じる
- **0086**: ADR-0086: Plan 節なし issue の plan を build 内で自律生成する
- **0091**: ADR-0091: リファレンス注入をフラットインデックスと glob 照合で決定的に行う

### Rejected

- **0044**: Reject snapshot-aware audit pipeline in favor of multi-run aggregation

## About MADR Format

This project uses [MADR (Markdown Any Decision Records)](https://adr.github.io/madr/) format, v4.

### How to Create a Decision Record

```bash
/dr "Decision Title"
```

### Status Meanings

- **Proposed**: Awaiting review
- **Accepted**: Approved, implementing or completed
- **Rejected**: Considered but not adopted
- **Deprecated**: Retired without a replacement DR
- **Superseded**: Replaced by another DR (e.g. `superseded by DR-NNNN`)

---

*Last updated: 2026-09-01*
*Auto-generated by: update-index.py*
