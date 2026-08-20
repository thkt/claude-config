---
status: "superseded by DR-0082"
date: 2026-07-05
---

# ADR 0029: Spec 駆動 E2E テスト生成のワークフロー統合

> Note (2026-04-24): `generating-tdd-tests` → `tdd-cycle` (2026-04-23) → `use-workflow-tdd-cycle` (2026-04-24) に順次改名。本 ADR は履歴保持のため原名を維持。

## Context and Problem Statement

LLMによるテスト生成パイプラインでは、ユニットテストが /codeのRGRCサイクルで自然に生成される一方、E2Eテストは /e2eスキルの手動起動に依存しており、ワークフローから孤立している。

現状の課題:

- SpecテンプレートのTest Scenariosに `e2e` タイプの例示がなく、/thinkがE2Eシナリオを生成しない
- /code, /featureのワークフローにE2Eテスト生成ステップがない
- /e2eスキルは対話的（AskUserQuestion）で、自動パスに組み込めない
- generator-testはUT/integration専用。E2Eにはagent-browserが必要でツール要件が異なる

きっかけ: Knight Rider Testingパターン（独立エージェントによるアプリ検証）の検討から、E2Eテスト生成の体系的不備が顕在化した。

## Decision Outcome

Spec駆動のE2Eテスト生成を /codeと /featureに統合する。専用agent `generator-e2e` を新設し、/e2eスキルは廃止する。

## Considered Options

- A: /e2e を subagent 化 (既存 /e2e をそのまま /code から呼び出し)
- B: generator-e2e 新設 (Spec 駆動の専用 agent + /e2e 廃止)
- C: generator-test に統合 (generator-test に agent-browser を追加)

### 検討したアプローチ

| アプローチ               | 概要                                    | 判定 |
| ------------------------ | --------------------------------------- | ---- |
| A: /e2e を subagent 化   | 既存 /e2e をそのまま /code から呼び出し | 却下 |
| B: generator-e2e 新設    | Spec 駆動の専用 agent + /e2e 廃止       | 採用 |
| C: generator-test に統合 | generator-test に agent-browser を追加  | 却下 |

### Approach A 却下理由

- /e2eはAskUserQuestionで対話的。自動パスで毎回ユーザーに質問が走る
- Spec駆動ではなく対話駆動のまま

### Approach C 却下理由

- generator-testのツール（Read/Write/Edit/Grep/Glob/LS）にagent-browserを追加するとツール表面が肥大化
- UTはRGRC（skip → activate）パターンだがE2Eはブラウザ操作が必要で実行モデルが異なる

### Approach B 採用理由

- Specの `Type: e2e` シナリオを入力として自動でPlaywrightテスト生成
- agent-browser依存をgenerator-e2eに閉じ込め、generator-testを汚染しない
- /codeにdev server検出を追加し、条件成立時のみspawn（オプトイン）
- /e2eの機能はgenerator-e2eがSpec駆動で代替するため、手動スキルは不要

## 変更対象

| ファイル                                                     | 変更内容                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| `templates/spec/template.md`                                 | Test Scenarios に `Type: e2e` 行追加                           |
| `agents/generators/generator-e2e.md`                         | 新規作成（Spec 駆動 + agent-browser）                          |
| `skills/code/SKILL.md`                                       | E2E phase（dev server 検出 + 条件付き spawn + error handling） |
| `skills/feature/SKILL.md`                                    | Phase 4.5 拡張（スクショ後に E2E 生成）                        |
| `skills/orchestrating-workflows/references/code-workflow.md` | E2E phase 追記                                                 |
| `skills/e2e/SKILL.md`                                        | 廃止                                                           |

変更なし: generator-test, evaluator-test, generating-tdd-tests

## 起動条件

E2Eテスト生成は以下の4条件が全て成立したときのみ実行:

| #   | 条件                              | 根拠                                                    |
| --- | --------------------------------- | ------------------------------------------------------- |
| 1   | Spec に `Type: e2e` シナリオあり  | オプトイン。dev server 必須を全プロジェクトに強制しない |
| 2   | agent-browser インストール済み    | /feature Phase 4.5 と同条件                             |
| 3   | dev server が package.json で検出 | scripts から dev/start パターンを検出                   |
| 4   | dev server 起動確認（ユーザー）   | AskUserQuestion で URL 確認                             |

## Consequences

### 良い結果

- E2EテストがSpec駆動で自然に生成される。手動起動の忘れがなくなる
- T-NNN体系を共有するためevaluator-testが変更なしでE2Eを計測可能
- /e2e廃止でスキル数が減り管理コスト低下
- litmus（ADR-0028）がE2Eテストも品質検査対象にできる基盤が整う

### 悪い結果

- 新agent追加（generator-e2e）
- dev server検出ロジックが /codeと /featureで2箇所に存在（DRY閾値3+ 未満のため許容）
- agent-browserの安定性に依存（定量データ不足）

### リスク軽減

- 3条件不成立時はskip（advisory）でgraceful degradation
- error handlingにagent-browser障害パスを追加（skip + advisory、ワークフロー継続）

## References

- ADR-0028: litmus（テスト品質静的検査）
- ADR-0013: Hook Trinityパターン
- Research: `.claude/workspace/research/2026-03-21-e2e-workflow-integration.md`
