---
status: "accepted"
date: 2026-07-07
decision-makers: thkt
supersedes: 0003-marketplace.md
---

# Marketplace を単一 build plugin に集約する

## Context and Problem Statement

ADR-0003 は commands / skills / agents を 5 プラグイン (plan / build / review / ship / toolkit) に分割した monorepo-marketplace を維持する決定だった。全プラグインの source を `"./"` から `{ github, thkt/dotclaude }` へ移した後 (PR #182)、install ごとに各プラグインがリポジトリルートを個別に clone することが判明した。

plugin の `commands` / `agents` / `skills` フィールドは広告範囲の指定でしかなく、実際の skill / agent / workflow ロードは clone 全体の慣習ディレクトリ (`skills/` `agents/` `workflows/`) を無条件に auto-discovery する。結果、5 プラグインが同一のリポジトリ全体を各 namespace で再露出し、reviewer-reuse や issue のような同一実体が最大 5 重に登録された (実測: cache 内 build / plan / review / ship 各ディレクトリに `3.0.0/{skills,agents,workflows}` フルコピー、agent 登録 114 件)。

phase 分割は同じリポジトリの 5 つのビューでしかなく、機能的な分離を生んでいない。

## Decision Drivers

- registry の多重登録を解消し、auto-selection の候補汚染を無くす
- 配布内容を減らさずに重複だけを除く (build 単体で全 skill / agent / workflow が一度ロードされる)
- build workflow の nested `workflow("code")` / `workflow("audit")` の解決 (build: namespace) を壊さない

## Considered Options

- Option A: 5 プラグイン維持 (ADR-0003 現状)
- Option B: 単一 build plugin に集約
- Option C: github source に per-plugin `path` を付けてリポジトリをサブディレクトリ分割

## Decision Outcome

Chosen option: "Option B: 単一 build plugin に集約"。build は既にリポジトリ全体を clone して全 skill / agent / workflow を build: namespace で auto-discovery しているため、他 4 プラグインを marketplace.json から除くだけで重複が消え、配布内容は一切減らない。issue も build: namespace で自動ロードされ、意図を残すため manifest の commands にも明示した。Option C はリポジトリ再構成が必要で作業量が大きく、現時点の重複解消には過剰。

build workflow の workflow / agent 解決は元から build: namespace のため、集約による挙動変化はない。

### Consequences

#### Positive Consequences

- skill / agent / workflow の多重登録が解消され、auto-selection の候補が一意になる
- marketplace.json が単一プラグインに縮小し、install 手順が 1 コマンドになる
- ローカル harness (settings.json hooks / `~/.claude` 直参照) は plugin cache を経由しないため影響なし

#### Negative Consequences

- plan / build / review / ship / toolkit の phase 別ブランディングが失われる (cross-plugin 呼び出し前提のため実運用上は無害)
- 個別 phase だけを install する選択肢が無くなる (全部入りの build 一択)

## More Information

ADR-0003 を supersede する。前提となった github source 化は PR #182。

### Reassessment Triggers

- build が全 skill / agent / workflow を auto-discovery しなくなったとき
- 単一 plugin のロード量が起動時間を圧迫し始めたとき
