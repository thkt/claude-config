# Research: Knowledge Reflection Cache-Safe Design

Generated: 2026-05-07
Intent: Pre-implementation design (ADR candidate material)
Issue: #37
Domain: Harness — Stop hook Reflection automation

## Purpose

issue #37 の AC を満たす design doc。Stop hook で Knowledge Reflection を自動化する際、prompt cache invalidation を回避する格納先と注入経路を確定する。

実装本体・抽出ロジック設計・抽出粒度の決定はスコープ外 (issue Out of scope の通り)。

## Source Reference

| Source | 用途 |
| --- | --- |
| code.claude.com/docs/en/hooks | 一次ソース。SessionStart / Stop の output 仕様 |
| ~/.claude/projects/-Users-thkt--claude/memory/project_harness-investigation-quality.md | 「最大ギャップ」記録、設計ドライバ |
| Anthropic Thariq "Lessons from Building Claude Code" (2026-02-19) | Motivation reference (一次取得不可、issue 経由で間接引用) |

## Cache Mechanics (AC1 前提)

claude-code hooks の output 仕様で確定済みの事実:

| 経路 | Cache 影響 | 根拠 |
| --- | --- | --- |
| CLAUDE.md / `.claude/rules/*.md` / 自動ロード対象ファイルの内容 | system prompt prefix の一部。書き換えで次セッション開始時の cache key 変更 | hooks docs: "For static context that does not require a script, use CLAUDE.md instead" (= CLAUDE.md 系は静的扱い) |
| SessionStart hook の stdout / `additionalContext` | system prompt prefix とは別領域。動的注入で cache 影響なし | hooks docs SessionStart decision control: "Any text your hook script prints to stdout is added as context for Claude" / "additionalContext = String added to Claude's context at the start of the conversation, before the first prompt" |
| Stop hook の stdout | debug log のみ。Claude には届かない | hooks docs exit code: "JSON output is only processed on exit 0. For most events, stdout is written to the debug log but not shown in the transcript. The exceptions are UserPromptSubmit, UserPromptExpansion, and SessionStart" |

含意:
- Stop hook はファイル書き出しでしか次セッションに情報を渡せない。直接の context 注入はできない
- SessionStart hook は stdout 経由で context 注入できるが、毎セッション fast に動く必要あり (重い処理は Stop で済ませる)
- CLAUDE.md / rules/*.md / MEMORY.md の動的書き換えは「次セッション開始時の cache key 変更」を意味する。過去セッションでビルドされた cache prefix が再利用できなくなる

## Storage Options Comparison (AC1)

| Option | 格納先 | 永続化 | 自動注入 | Cache 影響 | 評価 |
| --- | --- | --- | --- | --- | --- |
| A | 専用 reflection ファイル追記 (例: `~/.claude/projects/.../knowledge/<topic>.md`) | あり | なし | なし | 永続化のみ。次セッションが明示的に Read しないと使われない |
| B | SessionStart hook の stdout で動的生成して注入 | なし | あり | なし | 注入のみ。過去 reflection が蓄積されない |
| C | A + B 併用。Stop で書き出し → SessionStart で読み出して stdout 出力 | あり | あり | なし | 採用 |
| D | CLAUDE.md / MEMORY.md / rules/*.md / 自動ロード対象を動的書き換え | あり | あり | あり (cache invalidate) | 禁止 (issue Constraints) |

B 単独却下の根拠: Reflection は累積前提。SessionStart 注入だけだと毎セッション fresh start となり、Reflection が機能しない。A 単独却下の根拠: 永続化されても自動的に次セッションへ届かないため、本人が `/recall` 等で能動的に拾わないと使われない。C は永続化と自動注入を両立する唯一の組み合わせ。

## Recommended Design (AC2)

C を採用。session 中の cache を破壊しない設計を以下で担保する:

1. Stop hook はセッション終了時に動く。実行時点で現セッションの cache 利用は終わっており、書き出し処理が cache に与える影響はない
2. Reflection の格納先は専用ファイル。MEMORY.md / CLAUDE.md / rules/*.md / その他 auto-loaded path から一切参照されない。よってファイル更新が system prompt prefix を変えない
3. SessionStart hook はファイルを読んで stdout に出力するだけ。Claude Code は stdout 内容を additionalContext として注入する (system prompt prefix とは別領域)
4. additionalContext は session 単位で動的なので、内容が毎回違っても cache prefix は不変

## Implementation Checklist (AC3)

### Stop hook 実装時

Do:
1. Reflection 抽出物の書き出し先は専用ディレクトリ配下の専用ファイルとする (例: `~/.claude/projects/-Users-thkt--claude/knowledge/reflection.jsonl` 追記、または `~/.claude/projects/-Users-thkt--claude/knowledge/<session_id>.md`)
2. 書き出し処理は exit 0 で抜ける。stdout に出力しても Claude には届かない (debug log のみ) ので blocking 要素にしない
3. 既存の `~/.claude/hooks/notify-stop.sh` (timeout 12000ms) に併設するか新規 hook script を追加する。settings.json の Stop 配列に entry 追加

Don't:
1. CLAUDE.md / `.claude/rules/*.md` / `~/.claude/projects/-Users-thkt--claude/memory/MEMORY.md` を書き換えない (auto-loaded path)
2. memory ディレクトリ配下の既存 .md ファイル (MEMORY.md から参照されているもの) を書き換えない
3. exit 2 で blocking しない (Stop hook は session 終了処理。block しても効果不明、ユーザー体験悪化)
4. `permissions.deny` に該当する書き込み先を選ばない (settings.json の deny list 参照)

### SessionStart hook 実装時

Do:
1. settings.json の `hooks.SessionStart` に新規 entry 追加 (現状不在を `jq '.hooks | keys'` で確認済み)
2. matcher は最低限 `startup` を扱う。`resume` / `clear` / `compact` は方針に応じて分岐
3. 軽量に保つ (hooks docs: "SessionStart runs on every session, so keep these hooks fast")
4. stdout 出力 or `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}` の JSON 形式どちらでも可
5. 読み込み対象ファイルは固定パス。動的にパスを生成して書き換えるような構造にしない (cache 安定性の趣旨と整合)

Don't:
1. SessionStart hook の中で CLAUDE.md / `.claude/rules/*.md` / MEMORY.md を更新しない
2. 重い LLM 呼び出しや巨大ファイル読み込みを SessionStart に置かない (毎セッションのレイテンシ悪化)
3. Reflection ファイルを MEMORY.md からリンクしない (リンクすると memory loader が読み込み、auto-loaded path 化する)

### settings.json 変更例 (参考、実装時に確定)

```json
"Stop": [
  {
    "hooks": [
      { "type": "command", "command": "~/.claude/hooks/notify-stop.sh", "timeout": 12000 },
      { "type": "command", "command": "~/.claude/hooks/lifecycle/reflection-extract.sh", "timeout": 30000 }
    ]
  }
],
"SessionStart": [
  {
    "matcher": "startup|resume",
    "hooks": [
      { "type": "command", "command": "~/.claude/hooks/lifecycle/reflection-inject.sh", "timeout": 1000 }
    ]
  }
]
```

## Open Questions

implementation 本体ではなく、本 design doc の対象外として明示しておく:

- Reflection 抽出ロジック (LLM プロンプト設計、抽出粒度) — 別 ADR / 別 issue で扱う
- PostCompact hook 経由の `compact_summary` 活用 — 補完候補。本設計と独立に検討可
- 既存 `notify-stop.sh` との実行順序・失敗時の影響範囲 — implementation phase で確定
- Reflection ファイルの format (JSONL / Markdown / frontmatter 付き) — implementation phase で確定
- Reflection の sliding window / size cap (蓄積上限なしだと SessionStart の stdout が肥大化する) — implementation phase で確定

## References

- Issue: https://github.com/thkt/dotclaude/issues/37
- hooks docs: https://docs.claude.com/en/docs/claude-code/hooks
- Memory: `~/.claude/projects/-Users-thkt--claude/memory/project_harness-investigation-quality.md`
- 既存 hook 設計パターン: `~/.claude/projects/-Users-thkt--claude/memory/reference_hook-patterns-throttle-deferred.md`
- Motivation: Anthropic Thariq "Lessons from Building Claude Code: Prompt Caching Is Everything" (2026-02-19, issue 経由で間接引用)
