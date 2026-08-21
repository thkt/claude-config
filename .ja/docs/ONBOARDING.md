# Welcome to [Team Name]

## How We Use Claude

2026-08-17 時点の実測。過去 30 日に更新されたセッションログ 6018 件から、`<command-name>` の出現を集計した。

```text
Top Skills & Commands
/clear ████████████████████ 111
/build █████░░░░░░░░░░░░░░░ 28
/qualify ████░░░░░░░░░░░░░░░░ 23
/polish ████░░░░░░░░░░░░░░░░ 21
/model ███░░░░░░░░░░░░░░░░░ 14
/compact ███░░░░░░░░░░░░░░░░░ 14
/exit ██░░░░░░░░░░░░░░░░░░ 10
/issue ██░░░░░░░░░░░░░░░░░░ 9
/think █░░░░░░░░░░░░░░░░░░░ 8
/code-review █░░░░░░░░░░░░░░░░░░░ 6
/audit █░░░░░░░░░░░░░░░░░░░ 6
/assert █░░░░░░░░░░░░░░░░░░░ 6
/adrift █░░░░░░░░░░░░░░░░░░░ 6
```

MCP Servers: 同じ期間の呼び出しは 0 件。

## Your Setup Checklist

### Codebases

- [ ] dotclaude. github.com/thkt/dotclaude (Claude Code 設定: agents, skills, hooks, rules)
- [ ] scout. ~/GitHub/cli/scout (Web 取得/検索 CLI)
- [ ] recall. ~/GitHub/cli/recall (セッション検索)
- [ ] shields. ~/GitHub/cli/shields (PreToolUse ガードフック。現在 settings.json 未配線)
- [ ] guardrails. ~/GitHub/cli/guardrails (lint フック)
- [ ] kiku. ~/GitHub/cli/kiku (Slack セマンティック検索)
- [ ] kagami. ~/GitHub/apps/kagami (セッション追跡アプリ)
- [ ] tally. ~/GitHub/cli/tally (エンジニアリング時間追跡)

### CLI Tools to Install

- [ ] scout. Web 検索、ページ取得、GitHub リポジトリ探索、Slack メッセージ取得。`brew install thkt/tap/scout`
- [ ] recall. 過去セッションの横断検索。`brew install thkt/tap/recall`
- [ ] codegraph. シンボル単位の構造クエリ。`npm i -g @colbymchenry/codegraph` の後、リポジトリごとに `codegraph init`
- [ ] gh. GitHub API アクセス。`brew install gh && gh auth login`

### Skills to Know About

- `/build`. Plan 節付き issue を end-to-end で実装し draft PR を作る。最もよく使う入口。
- `/qualify`. issue を build へ渡せる状態か点検する。build 起動前に走らせる。
- `/polish`. Codex の外部レンズによる review と cleanup。機能の落着後に slop を捕まえる。
- `/issue`. 構造化した title と body で GitHub Issue を作る。plan があれば `## Plan` 節へ転記する。
- `/think`. plan を生成する設計探索 (issue の Plan 節へ転記)。非自明な新機能のエントリポイント。
- `/audit`. 専門 reviewer (security, type safety, silent failures 等) を diff に対して fan-out する。
- `/assert`. merge 可否の独立判定。Codex を隔離 worktree で並走させる。
- `/adrift`. DR と現行コードの乖離をスキャンする。
- `/commit`. ステージ済み diff から Conventional Commits メッセージを生成する。手書きする代わりに編集後へ実行する。
- `/challenge`. 提案、設計、計画への悪魔の代弁者パス。アーキテクチャ判断を確定する前に使う。
- `/compact`. 使用率が 70% に近づいたらコンテキストを要約・圧縮する。長いセッションで先回り実行する。

## Team Tips

_TODO_

## Get Started

_TODO_

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy. warm, conversational,
not lecture-y.

Open with a warm welcome. include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes. [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections. offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data. don't extrapolate them into a "team
workflow" narrative. -->
