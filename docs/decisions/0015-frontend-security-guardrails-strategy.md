---
status: "accepted"
date: 2026-02-23
decision-makers: thkt
---

# Adopt Pattern-Match + Taint-Checklist Strategy for Frontend Security

## Context and Problem Statement

フロントエンドのセキュリティチェックを強化するにあたり、OWASP Top 10 に基づく脆弱性検知をどの仕組みで実現するかを決定する必要がある。

現在の guardrails は `security.rs` で基本的な XSS パターン（innerHTML, document.write 等）を検知しているが、eval/ハードコード秘匿情報/mixed content/HTML文字列結合/open redirect が未カバー。また、taint tracking（ユーザー入力→危険APIの流れ追跡）や設計レベルのセキュリティ問題（dangerouslySetInnerHTML + サニタイザ確認、postMessage origin 検証等）にも対応していない。

## Decision Drivers

- **Vendor 非依存**: 外部ツールの提供形態変更で使えなくなるリスクを避けたい
- **既存インフラ活用**: guardrails (Rust, PreToolUse) と reviewing-security skill (/audit) の二層構造を活かす
- **false positive の抑制**: 開発体験を損なわないチェック精度
- **メンテナンスコスト**: ルール管理の長期的な負担
- **カバレッジ**: OWASP Top 10 のフロントエンド関連項目の網羅

## Considered Options

### Option 1: Semgrep OSS を reviews に統合

Semgrep OSS CLI を claude-reviews の pre-flight チェックに組み込み、`--config=p/owasp-top-ten` でスキャン。

- Good: Semgrep Security Research チームのルールをそのまま利用
- Good: YAML ベースのカスタムルール追加が容易
- Bad: OSS 版は単一ファイル taint のみ（クロスファイルは Pro 限定）
- Bad: Pro と OSS の機能境界が拡大傾向（2024年に LGPL-2.1 へ変更した前歴）
- Bad: Python ランタイム依存 (~200MB)、guardrails/reviews の Rust バイナリと異質
- Bad: OSS 版の解析力だと guardrails のパターンマッチとの差別化が薄い

### Option 2: Semgrep OWASP ルールから知見を抽出し自前実装（guardrails + skill 強化）

Semgrep ルール（Apache-2.0）を参考に、正規表現で拾えるパターンを guardrails の Rust ルールに移植。taint tracking 系の知見は reviewing-security skill のチェックリストとして Claude に提供。

- Good: Vendor 依存ゼロ、提供形態変更の影響を受けない
- Good: guardrails の即時ゲート（<1秒）と Claude レビュー（taint 追跡）の二層で OWASP カバー
- Good: 既存インフラ（Rust ルールシステム、skill reference）にそのまま乗る
- Bad: 正規表現の限界で taint tracking は不可（Claude レビューで補完）
- Bad: Semgrep ルール更新を手動でキャッチアップする必要あり

### Option 3: Bearer CLI を reviews に統合

Bearer CLI（Elastic-2.0）でデータフロー解析を行い、OWASP/CWE ベースのスキャンを実行。

- Good: OSS でデータフロー解析が可能
- Good: OWASP Top 10 / CWE Top 25 ルール組み込み
- Bad: カスタムルールの柔軟性が低い
- Bad: Go 実装でデータフロー解析が重く、reviews の 45秒 timeout に収まらないリスク
- Bad: フロントエンド（React/Vue）固有のルールが Semgrep より少ない

## Decision Outcome

**Chosen option: Option 2** - Semgrep OWASP ルールから知見を抽出し自前実装。

Vendor 依存ゼロで、guardrails（即時パターンマッチ）+ reviewing-security skill（Claude による taint 追跡）の二層防御が最もバランスが良い。

Semgrep OSS を統合しても、OSS 版の解析力（単一ファイル taint）は guardrails のパターンマッチと大差なく、導入コスト（Python 依存）に見合わない。Semgrep の本当の価値であるクロスファイル taint は Pro 限定であり、これは Claude（reviewer-security）がファイル横断で文脈を読んでレビューすることで代替できる。

### oxlint 委譲の判断

guardrails の 14 ルールを oxlint/biome でカバーできるか検証した結果、**移譲可能なルールはゼロ**。

理由:

- guardrails ルールの多くはファイルパス文脈（`/components/` 内のみ等）や引数内容解析（console.log の中身チェック）を含む
- oxlint のセキュリティルールは現状 5 件（`no-eval`, `react/no-danger`, `react/no-danger-with-children`, `react/iframe-missing-sandbox`, `no-script-url`）
- guardrails と oxlint はタイミングが異なる（書き込み内容の即時検査 vs ファイル全体 lint）

**ただし oxlint がカバーしているパターン（`react/no-danger` 等）は guardrails で重複実装しない**。これにより責務が明確に分離される。

### Positive Consequences

- 外部ツールへの依存なし、長期的なメンテナンス安定性
- Semgrep の OWASP ルール知見（Apache-2.0）を活用しつつ、自前の実装で制御可能
- guardrails（<1秒）で「明らかにアカン」パターンを即ブロック
- reviewing-security で「設計レベル・文脈依存」の問題を /audit 時にキャッチ

### Negative Consequences

- Semgrep ルールの更新を手動でキャッチアップする必要がある（定期的な差分確認）
- 正規表現の限界により、guardrails 単体では taint tracking は不可能（Claude 補完前提）

## Implementation Plan

Phase 1: guardrails に 5 ルール新規追加 + 1 ルール改善（eval, hardcoded_secret, http_resource, raw_html, open_redirect, innerHTML 改善）
Phase 2: reviewing-security skill にフロントエンド taint チェックリスト追加

詳細: `.claude/workspace/planning/2026-02-23-security-guardrails/sow.md`（ローカル作業ファイル、gitignore 対象）

## Rollback Plan

- guardrails ルール: `.claude-guardrails.json` で個別ルールを `false` に設定して無効化
- skill 強化: reference ファイル削除と agent Phase 削除で元に戻せる

## Success Criteria

- guardrails で eval/ハードコード秘匿情報/mixed content/HTML結合/open redirect が検知される
- false positive rate が既存ルールと同等以下（<5%）
- reviewing-security が dangerouslySetInnerHTML + サニタイザ確認等の taint パターンをチェックする

## Reassessment Triggers

- Semgrep OSS の解析力が単一ファイル taint を超え、自前実装との差が開いたとき
- 手動キャッチアップが追いつかず、OWASP ルールの取り込み漏れが検出漏れとして出たとき
