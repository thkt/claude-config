---
status: "proposed"
date: 2026-03-20
decision-makers: thkt
---

# ADR-0027: プラグイン定義を sentinels リポに集約する

## Context and Problem Statement

5つのRust製hookツール（guardrails, gates, reviews, formatter, chronicler）をClaude Code PluginとしてOSS配布したい。現状は各ツールリポが `.claude-plugin/` と `hooks/` を個別に持ち、それぞれが独立したmarketplaceとして機能する。ユーザーは5つのmarketplaceを個別に登録する必要があり、発見性が低い。

プラグイン定義（hooks.json, wrapper.sh, install.sh, plugin.json）の管理場所を決める必要がある。

## Decision Drivers

- ユーザーの導入コスト: marketplace登録回数を最小化したい
- DRY: プラグイン定義の重複管理を避けたい
- 各ツールの独立性: ソースコードとバイナリリリースは各リポで完結させたい
- リリース同期: ツールのバージョン更新が自動的にプラグインに反映されるべき

## Considered Options

### A. 各ツールリポが個別に marketplace を提供（現状維持）

- Good: 各リポが自己完結。追加作業なし
- Bad: ユーザーは5 marketplaceを個別登録。発見性が低い
- Bad: hooks.jsonの変更が5リポに分散

### B. sentinels リポに URL source で参照（thin index）

sentinelsはmarketplace.jsonのみ持ち、各プラグインの実体はURL sourceで各ツールリポを参照。

- Good: sentinelsのメンテがほぼゼロ（marketplace.json + READMEのみ）
- Good: DRY（プラグイン定義は各リポに1箇所）
- Bad: URL sourceがカスタムmarketplaceで動作する実績がない。公式marketplaceでは定義されているが、実際にinstallされた事例がゼロ

### C. sentinels リポに path source でプラグイン定義を集約

sentinelsがhooks.json, wrapper.sh, install.sh, plugin.jsonを一元管理。各ツールリポからプラグイン定義を削除。

- Good: path sourceは全marketplaceで動作確認済み
- Good: hooks定義の変更が1リポで完結
- Good: ユーザーは1 marketplace追加で全ツールにアクセス
- Bad: wrapper.shが5ディレクトリに重複（プラグイン隔離のため不可避）
- Bad: リリース時にsentinelsのplugin.json version同期が必要（CIで自動化）

## Decision Outcome

Chosen option: C. sentinelsリポにpath sourceでプラグイン定義を集約。

Bが理想だが、URL sourceのカスタムmarketplaceでの動作実績がないため、実績のあるpath sourceを選択。sentinelsはプラグイン定義のthin layer（hooks.json + wrapper.sh + install.sh + plugin.json）のみ持ち、ソースコードやバイナリは含まない。

各ツールリポはRustソースコード + バイナリリリース + Homebrew更新に専念し、プラグイン配布の責務をsentinelsに委譲する。

### Consequences

- 各ツールのrelease.ymlに `update-sentinels` ジョブを追加（homebrew-tap同パターン）
- 各ツールリポから `.claude-plugin/` と `hooks/` を削除
- wrapper.shは `${CLAUDE_PLUGIN_ROOT}` のスコーピングにより共有不可。5ディレクトリに同一ファイルをコピー配置（意図的重複）
- URL sourceがカスタムmarketplaceで動作確認された場合、Bへの移行を検討可能

## Links

- SOW: workspace/planning/2026-03-20-sentinels/sow.md
- ADR-0026: 仕様-コード収束則（Rustバイナリ化の判断基準として関連）
- ADR-0006: 決定論的処理のスクリプト化パターン（wrapper.shの設計パターン）

## Reassessment Triggers

- URL source のカスタム marketplace に動作実績ができ、path source を選んだ理由が消えたとき
- wrapper.sh の意図的重複が 5 ディレクトリを超え、同期漏れが実際に起きたとき
