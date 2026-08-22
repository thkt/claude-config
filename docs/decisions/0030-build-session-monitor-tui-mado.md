---
status: "proposed"
date: 2026-03-22
---

# ADR 0030: Claude Code セッション監視 TUI mado の構築

## Context and Problem Statement

Claude Codeの並列セッション運用が常態化し、以下の問題が発生している:

- どのセッションが何をやっているか忘れる（並列3+ で顕著）
- gatesのstop hookブロックに気づかず待ちぼうけ
- トークンコストの全体像が見えない

先行事例としてSessionDock (adachic/sessiondock) がTauri v2アプリで同様の課題を解決しているが、Hookパイプライン統合がなく、Ghosttyのsplit単位フォーカスも未実装。

調査で判明した事実:

- ~/.claude/ のJSONLにhook_progress, stop_hook_summaryが記録されており、gatesのpass/block判定がJSONLのみで可能
- Ghostty v1.3+ でAppleScript対応（ウィンドウ/ターミナル列挙、cwd取得、UUID）
- TTY/PIDのスクリプト公開は未対応（v1.4以降のfeature request）

## Decision Outcome

ratatuiベースのRust TUIバイナリ `mado` を新規構築する。Ghostty splitに常駐し、全セッションの状態・Hook結果・コストをリアルタイム表示する。

## Considered Options

- A: Rust TUI (ratatui) - Ghostty split に常駐する TUI、JSONL のみ読む
- B: Tauri v2 アプリ - SessionDock と同じメニューバー + ダッシュボード
- C: CLI デーモン + 通知 - バックグラウンドで動き、状態変化を通知のみ

### 検討したアプローチ

| アプローチ             | 概要                                            | 判定 |
| ---------------------- | ----------------------------------------------- | ---- |
| A: Rust TUI (ratatui)  | Ghostty split に常駐する TUI。JSONL のみ読む    | 採用 |
| B: Tauri v2 アプリ     | SessionDock と同じメニューバー + ダッシュボード | 却下 |
| C: CLI デーモン + 通知 | バックグラウンドで動き、状態変化を通知のみ      | 却下 |

### Approach B 却下理由

- 別ウィンドウへの切り替えが必要で「忘れる」問題の解決力が弱い
- Tauri + React/TSのメンテコストが既存Rust CLIエコシステムと不整合
- OSSとしての依存が重い

### Approach C 却下理由

- 常時表示がないため「忘れる」問題に対する解決力がもっとも弱い
- 通知は見逃す（通知が来ても確認しない問題は解決しない）
- ダッシュボード的な一覧性がない

### Approach A 採用理由

- Ghostty splitに常駐 → 常時視界に入り「忘れる」問題を根本解決
- Rust一本 → 既存CLIエコシステム（gates, guardrails, recall等）と同じビルド・配布パイプライン
- JSONLのみ → gates/shields側の改修不要。hook_progress / stop_hook_summaryで完結
- ratatui + crossterm → 安定、mouse対応、Ghostty互換

## 技術判断

### データソース: JSONL のみ

実証: gatesプロジェクトのJSONLでhook_progress 3,973件、stop_hook_summary 198件を確認。preventedContinuationフィールドでpass/block判定可能。

| 検討した方式   | 判定 | 理由                                                                       |
| -------------- | ---- | -------------------------------------------------------------------------- |
| JSONL のみ     | 採用 | hook_progress, stop_hook_summary が JSONL に記録済み。追加データソース不要 |
| Event ファイル | 却下 | gates/shields 側の改修が必要。疎結合だが YAGNI                             |
| 共有 SQLite    | 却下 | recall との結合度が上がる。責務が異なる                                    |

### Terminal Jump: AppleScript + cwd マッチ

Ghostty v1.3+ のAppleScript対応で、ターミナル列挙とcwd取得が可能。TTY/PIDは未公開のためcwdでマッチし、重複時はdisambiguation UIを表示する。

制約: 同一cwdセッションの完全識別はGhosttyのTTY/PID対応（v1.4予定）まで待つ。jump.rsに抽象化し、将来のAPI変更に備える。

### ポーリング: 1 秒固定

notify crate（FSEvents）はディレクトリ単位の監視が煩雑で、sessions/ とprojects/ の両方を横断監視する必要がある。SessionDockの1秒ポーリングが実績あり、11MB+ JSONLでもインクリメンタル（file_pos）で < 10ms。

## Consequences

- 新規リポジトリ: ~/GitHub/cli/mado/
- Homebrew tap: thkt/tap/mado
- 既存ツールへの変更: なし
- BACKLOG.mdにmadoを追加

## References

- SOW: ~/.claude/workspace/planning/2026-03-22-mado/sow.md
- Spec: ~/.claude/workspace/planning/2026-03-22-mado/spec.md
- SessionDock: <https://github.com/adachic/sessiondock>
- Ghostty AppleScript: Ghostty v1.3 release (2026-03-09)

## Reassessment Triggers

- 監視対象の状態取得元が変わり、TUI 側の解析を作り直す必要が出たとき
- Ghostty split に常駐させる使い方をやめたとき
