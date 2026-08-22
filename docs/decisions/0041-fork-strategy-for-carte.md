---
status: "proposed"
date: 2026-04-19
decision-makers: thkt
---

# ADR-0041: carte を CCPlanView からフォークする運用方針

## Context and Problem Statement

AI 駆動開発で markdown ドキュメント (plan.md / spec.md / SOW / audit / .claude/rules, skills) が爆増し、リニアスクロールでは構造認知が追いつかない。セクションカードの 2D 俯瞰ビューアが必要だが、既存 CCPlanView は 1 ファイル精読 (diff 可視化中核) に最適化されており、俯瞰モードを混ぜると UI が二兎を追う形になる。

別アプリとして分離する場合、(1) ゼロから新規に作る、(2) CCPlanView をフォークして派生させる、(3) 共通コアを shared Swift package に先に抽出する、のいずれかを選ぶ必要がある。同時に、フォーク後の共通部品 (MarkdownFileDocument, WKWebView wrapper, TitlebarDragView, DropOverlay) を 2 リポジトリで並走メンテするコストをどう扱うかを決める必要がある。

## Decision Drivers

- CCPlanView の MD rendering pipeline (marked.js + highlight.js + markdown-body CSS) は成熟しており、同等の fidelity をゼロから作り直すコストは大きい
- WKWebView まわりの macOS 固有 workaround (TitlebarDragView, DropOverlayView) は仕様依存で macOS アップデートで壊れる可能性。並走メンテコストが累積する
- carte は読み取り専用・セクション俯瞰がコアで、CCPlanView の diff 機能や plan mode hook は不要
- Phase 2 以降の拡張 (live-reload, 全文検索, Mermaid) は別軸。フォーク運用にロックされると拡張余地を狭める
- 両アプリを同じユーザーが併用することが前提 (CCPlanView = 精読 / carte = 俯瞰)。Bundle ID / URL scheme / UTI の衝突を避ける必要

## Considered Options

### Option 1: CCPlanView フォーク + 独立運用

CCPlanView のソースをコピーして別アプリ化。Bundle ID / URL scheme / Product 名を分離。CCHookInstaller 依存と Diff 機能は削除。index.html は全面書き換え。

- Good: rendering pipeline を丸ごと流用可能
- Good: notarize / DMG / brew 配布パイプラインを丸ごと流用可能
- Good: CCPlanView 側の UX (精読) を汚さない
- Bad: 共通部品のバグ修正・macOS 対応を 2 回行う必要
- Bad: shared package 化のタイミング判断が属人的

### Option 2: CCPlanView に俯瞰モードを追加

1 つのアプリに「精読モード / 俯瞰モード」を切り替える。

- Good: リポジトリ 1 つで済む
- Bad: UX が二兎を追う (精読と俯瞰で情報密度・操作モデルが違う)
- Bad: Bundle ID / アイコンが 1 つのため、Dock で両モードを切り替える体験になる
- Bad: CCPlanView の diff 機能と carte の俯瞰は機能軸が直交。複雑度が非線形に増える

### Option 3: 共通コアを shared Swift package に先に抽出

`CCCore` (仮) を先に作り、CCPlanView と carte は package を import する形にする。

- Good: メンテコストが 1 箇所に集約
- Bad: 現時点で共通利用者が 2 アプリしかなく、抽象化の失敗コストが高い
- Bad: carte の設計が固まる前に抽出すると、誤った境界で package 化する恐れ

## Decision Outcome

Option 1 を採用。Phase 1 ではフォークで独立運用する。

Phase 1 では shared package 化しない。両リポジトリで並走メンテし、差分は手動で伝搬する。

## Technical Details

### フォーク時の変更点

| 項目            | CCPlanView               | carte                                            |
| --------------- | ------------------------ | ------------------------------------------------ |
| Bundle ID       | sh.saqoo.ccplanview      | sh.saqoo.carte                                   |
| URL scheme      | ccplanview://            | carte://                                         |
| Product name    | CCPlanView               | carte (CLI), Carte (App)                         |
| UTI rank        | LSHandlerRank: Alternate | LSHandlerRank: Alternate (両方 Alternate で共存) |
| CCHookInstaller | dependency 有            | 削除                                             |
| Diff 機能       | 有                       | 削除                                             |
| index.html      | 既存                     | 全面書き換え                                     |

### 維持する共通部品

- MarkdownFileDocument (Document infrastructure)
- DocumentGroup pattern
- MarkdownWebView + WKWebView wrapper (diff 関連は剥がす)
- AppDelegate URL scheme handling pattern
- TitlebarDragView / DropContainerView / DropOverlayView
- notifier → carte CLI パターン
- FileWatcher (Phase 2 live-reload 用)
- Asset catalogs / build scripts / notarize pipeline (アプリ名だけ差し替え)

### 削除する部品

- CCHookInstaller package dependency
- HookManager.swift
- Diff 関連コード全部 (MarkdownWebView.swift の showDiff / resetDiff / setDiffEnabled 呼び出し、index.html の LCS 系 1000 行弱)
- plan mode hook 関連 UI (CommandGroup / HookSetupUI 呼び出し)

### shared package 化トリガ運用

両アプリで同じ修正が 2 回入った時点で、該当部品を `CCCore` (仮) として Swift Package に抽出する。抽出時は新しい ADR を起票し、package の API 境界を記録する。

### UTI / 既定アプリ運用

両アプリとも `LSHandlerRank: Alternate`。Finder ダブルクリック時の既定アプリは macOS が他アプリを選ぶ可能性があるため、carte の起動は以下を正規経路とする:

1. CLI: `carte <file>`
2. URL scheme: `carte://open?file=<path>`
3. `open -a Carte <file>`
4. hook 経由 (下記)

### 既存 hook との統合

`/Users/thkt/.claude/hooks/viewer/ccplanview-open.sh` は PostToolUse で sow/spec/idr を自動的に CCPlanView に展開する。carte リリース後に以下の振り分けに変更:

| ファイル種別            | viewer     | 理由                                     |
| ----------------------- | ---------- | ---------------------------------------- |
| `*/sow.md`, `*/spec.md` | carte      | 構造俯瞰が主用途                         |
| `*/idr-*.md`            | CCPlanView | diff 可視化が主用途 (carte は diff なし) |

切替は Phase 5 Step 4 で実施。AS-003 dogfooding 評価は carte がデフォルト経路に入ってから始める。

### アイコン差別化

Dock / Launchpad / Finder で両アプリを見分けられるよう、アイコン色相を変える (CCPlanView はブルー系、carte はオレンジ or グリーン系) 。Assets.xcassets を差し替え。

### 撤退時の fork リポ扱い

AS-003 (Canvas/Heptabase への移住判断) で撤退する場合、carte リポジトリは archive する (削除ではなく)。理由: 設計・実装の記録は将来の参照資産となる。CCPlanView 側に逆マージは行わない (UX 軸が違うため)。

## Links

- carte SOW: `~/.claude/workspace/planning/2026-04-19-carte/sow.md`
- carte Spec: `~/.claude/workspace/planning/2026-04-19-carte/spec.md`
- CCPlanView (fork source): /Users/thkt/GitHub/apps/CCPlanView
- k1LoW/mo (CLI 起動パターンの参考): <https://github.com/k1LoW/mo>

## Reassessment Triggers

- CCPlanView 側の WKWebView 回避策 (TitlebarDragView / DropOverlayView 等) に同じ修正が両アプリに 2 回入ったら
- macOS メジャーバージョンアップで両アプリに同種の対応が必要になったら
- Phase 2 以降で third app を派生させる計画が立ったら
