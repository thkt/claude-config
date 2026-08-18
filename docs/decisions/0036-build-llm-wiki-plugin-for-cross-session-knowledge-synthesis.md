---
status: "deprecated"
date: 2026-04-07
decision-makers: thkt
---

# LLMによるクロスセッション知識合成wikiプラグインの構築

> Deprecated 2026-07-09: wiki プラグインは初版1コミット（2026-06-19）のまま enabledPlugins にも SessionEnd hook にも配線されず、`.wiki` データも生成されない死蔵状態だった。クロスセッション知識合成の構想は kagami へ引き継ぐ方針。wiki 本体（`~/GitHub/plugins/wiki/`、リモートなしのローカルのみ）は非採用として参照用に残置する。下記の Decision Outcome は kagami 設計時の設計資産として保持する。なお本文は Stop hook を前提に書かれているが、実装は SessionEnd hook で行われた（Stop hook は毎ターン発火するため）。

## Context and Problem Statement

プロジェクトの判断・実装・調査知識がセッションごとに失われる。
delta（per-sessionのSOW/Spec差分）、recall（生セッション履歴検索）、MEMORY.md（ユーザー設定・feedback）は
いずれも存在するが、複数セッションをまたいだドメイン知識を合成・維持する層がない。

例: kiku開発で学んだSlack APIのcursor挙動は複数セッションに散在し、次回触れるたびに再調査が発生する。

## Decision Drivers

- 再調査・再判断コストがプロジェクト数の増加とともに線形に累積する
- deltaはper-session差分であり、cross-session合成には構造的に不向き
- MEMORY.mdはユーザー設定・feedbackに特化し、ドメイン知識の蓄積を想定していない
- LLMが自律的に蓄積するため、ユーザーの手動操作は不要であること

## Considered Options

### A: Stop hook → headless `claude -p`（採用）

Stop hook（transcript_path取得可能と実験確認）が発火 → shell pre-filter → `claude -p`でwiki更新。

- Good: セッション終了直後に処理。次セッション待ち不要
- Good: transcript_pathをStopフックで取得できることを実験で確認済み
- Bad: headless invocationが現在のhookスタックを全継承する → isolated config profileで解決
- Bad: trivialセッションでも発火 → shell pre-filterで解決

### B: Stop → pending marker → SessionStart注入（deltaパターン）

Stop hookがmarkerファイル書き込み → 次SessionStartでadditionalContext注入。

- Good: deltaで実証済みのパターン
- Bad:「次セッション先頭」に遅延。セッションが開かれなければ実行されない
- Bad: セッション境界をまたぐため文脈が劣化する

### C: PostToolUse on key skills

`/think`, `/code`, `/audit`完了時にPostToolUseでwiki更新を注入。

- Good: 重要判断直後に更新
- Bad: スキル完了検知の仕組みが複雑。通常会話が対象外になる

## Decision Outcome

**Option A（Stop hook → headless `claude -p`）を採用**、以下の3つのガードを付加する。

### Guard 1: Shell pre-filter

```zsh
line_count=$(wc -l < "$transcript_path")
[ "$line_count" -lt 30 ] && exit 0
grep -q '"tool_use"' "$transcript_path" || exit 0
```

trivialセッション（30行未満orツール使用なし）はheadless呼び出しをスキップ。

### Guard 2: Recursion guard

```zsh
[[ -n "$WIKI_HOOK_SESSION" ]] && exit 0
WIKI_HOOK_SESSION=1 claude -p "..." --config "$PLUGIN_ROOT/hooks/wiki-headless.json"
```

headlessセッション自身のStopフックで再帰しない。

### Guard 3: Isolated hook profile

`wiki-headless.json`はgates/guardrails/formatterを無効化したminimal config。
headless wiki更新セッションに通常のインタラクティブhookスタックを継承させない。

## Wiki Scope（deltaとの境界）

| ツール    | 単位                 | 内容                                                 |
| --------- | -------------------- | ---------------------------------------------------- |
| delta     | セッション単位       | SOW/Specからの差分・今回の判断                       |
| MEMORY.md | 永続・手動           | ユーザー設定・feedback・好み                         |
| recall    | 全セッション         | 生の会話履歴（検索可能）                             |
| **wiki**  | **クロスセッション** | **ドメイン知識の合成（delta/MEMORYに入らないもの）** |

wiki-worthyの判定基準:

- 複数セッションにまたがって参照されうるドメイン知識
- 特定ライブラリ・APIの挙動・制約（再調査価値が高いもの）
- プロジェクト横断的な実装パターン
- 調査結果の合成（単一セッション発見でも将来参照価値が高いもの）

delta/MEMORY.mdに書かれるべきものはwikiに書かない。

## Consequences

- Good: セッション終了後に自動でwikiが更新される（ユーザー操作不要）
- Good: isolated config profileにより既存hookパイプラインへの影響なし
- Good: pre-filterにより90%以上のtrivialセッションでAPI呼び出しが発生しない
- Bad: Stopフックに処理が集中するため、hook timeoutの設定に注意が必要
- Bad: headless `claude -p`のコストは累積するため、長期的にfilter条件の調整が必要になる可能性がある
