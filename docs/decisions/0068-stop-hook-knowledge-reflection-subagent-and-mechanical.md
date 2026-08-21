---
status: "deprecated"
date: 2026-05-14
decision-makers: thkt
scope: [meta, harness, hooks]
---

# Adopt Stop hook Knowledge Reflection with subagent extraction and mechanical activity log

> Deprecated 2026-08-21: この決定の実装は 2026-05-31 に無効化された。後継の DR-0097 も 2026-08-21 に撤去した。`projects/*/knowledge/reflection` にデータが残るが、書き込む配線は現存しない。

## Context and Problem Statement

`~/.claude` ハーネスは PreToolUse / PostToolUse 層で「コードの正しさ」(guardrails / gates) を強制するが、「調査の質」側 (knowledge 蓄積、暗黙判断の外化) は skill 手動実行に依存する。Warren ハーネスとの比較で「Knowledge Reflection 自動化」が最大ギャップと特定済み (memory `project_harness-investigation-quality.md`)。Zenn 2026-05-02 "ソフトウェアの『設計原則』を、なぜ一部のエンジニアは生理的に嫌うのか" は「観測可能性の非対称性」「起きなかった事象は計上しないと組織から消える」を定式化し、~/.claude にも同じ問題が継続適用される。

issue #37 (closed, 2026-05-07) は cache-safe な格納先・注入経路を確定した。採用案 C: Stop hook で専用ファイルに書き出し + SessionStart hook で stdout 経由 additionalContext 注入。CLAUDE.md / MEMORY.md / rules/*.md / auto-loaded path の書き換えは禁止 (system prompt prefix 変更 = 次セッション全体の cache invalidate)。

本 ADR は issue #37 の Out of scope であった「抽出主体・粒度・format・size cap・ローテーション・既存 wiki plugin との co-existence」を決定する。

## Decision Drivers

- `~/.claude/.claude/OUTCOME.md` の Behavior B2 (durable 外化資産が残り続ける) と Indicator (「起きなかった事象」が観測可能に計上される) を満たす。
- B3 (ユーザー低介入) と整合: 手動 promote 前提の設計は primary path にしない。
- B4 (他リポ複製可能) と整合: ~/.claude 固有の auth path や API 直叩きに依存しない。
- cache-safe (issue #37 Do-list / Don't-list) を維持。
- LLM self-confidence を gate にしない (memory `feedback_no-llm-self-confidence-as-gate.md`)。
- 既存 wiki plugin (ADR-0040) との co-existence: 現状 dormant (`enabledPlugins` 不在) だが、将来 enable する場合の dedup contract を将来 ADR に開く。

## Considered Options

### Option A: Stop hook subagent extraction + mechanical activity log 並走 (chosen)

Stop hook で `claude --bare --plugin-dir --permission-mode bypassPermissions` の subagent を spawn して LLM 抽出を行い、並走で zsh script が history.jsonl をルールベース解析して activity log を JSONL に append。両者は merge せず別ファイルに書き、SessionStart 側で読み出し時に concat する。

- Good: LLM が「起きなかった事象 / 暗黙判断」を抽出し、mechanical が「Edit/Write/commit パス」を確実に拾う。failure mode が独立し、片方が壊れても他方が機能する。
- Good: wiki plugin の subagent 起動レシピ (`hooks/stop-wiki.sh` 実証) が転用可能。API key 不要なので B4 portability 維持。
- Good: 抽出 shape が違う情報を write 時には混ぜないので、後続 reader (recall / skill / 人間) が用途別に拾える。
- Bad: hook 実行コストが二重になる。Stop hook budget (30s) 内で両方走らせる必要。
- Bad: subagent 起動には recursion guard (`REFLECT_HOOK_SESSION` env) が必須。実装ミスで session 2 で deadlock するリスク。

### Option B: subagent extraction only

LLM 抽出のみ。activity log は持たない。

- Good: 実装単純。1 hook script で済む。
- Bad: LLM 抽出が失敗または不安定なとき、activity の trace が一切残らない。
- Bad: 「いつ何を編集したか」のような mechanical fact も LLM の summary に依存し、再現性が下がる。

### Option C: mechanical activity log only

history.jsonl のルールベース解析のみ。LLM 不使用。

- Good: 完全に決定的、再現性高。LLM コスト 0。
- Bad: 「起きなかった事象」「暗黙判断」が history.jsonl から原理的に抽出できない。OUTCOME Indicator (反事実的成果の計上) を満たせない。
- Bad: B2 (durable 外化資産) を activity log layer でしか満たせず、reflection layer に届かない。

### Option D: Manual `/reflect` skill

Stop hook は marker だけ書き、次セッションでユーザーが `/reflect` を手動実行して promote。

- Good: 実装最小、LLM コスト透明。
- Bad: B3 (ユーザー低介入で「問いの組み立て」「判断」に集中できる) と直接矛盾。skill 手動実行を要求すること自体が介入。
- Bad: 自動化の習慣化が成立せず、Knowledge Reflection ギャップが残る。

## Decision Outcome

Option A を採用する。

### 詳細決定

1. 抽出主体: subagent (LLM) + 並走 mechanical script。両者を別ファイルに emit、SessionStart 読み出し時に merge。
2. 抽出粒度: 3 カテゴリ
   - `realization`: 気づき (新しく分かったこと)
   - `judgment`: 暗黙判断 (意識せず行った decision、棄却された案)
   - `counterfactual`: 起きなかった事象 (未然防止された設計ミス、拾われなかった懸念)
3. Format:
   - LLM 抽出: per-session_id Markdown (`knowledge/reflection/<session_id>.md`)、frontmatter で `confidence: confirmed|tentative` と `categories` を持つ
   - mechanical: per-session_id JSONL (`knowledge/activity/<session_id>.jsonl`)
   - index: append-only JSONL (`knowledge/reflection-index.jsonl`)、1 行 = 1 session
4. Size cap: SessionStart で stdout に乗せるのは直近 N=10 セッション。11 件目以降は file 保持のみで stdout 非掲載。
5. Confidence handling: frontmatter tag のみ。gating には使わない。SessionStart 側は `confidence: confirmed` を優先、tentative は budget に応じて含める。
6. Recursion guard: 環境変数 `REFLECT_HOOK_SESSION=1` を subagent 起動時に export。subagent 側 Stop hook で読み取り、`exit 0` で即座に抜ける。
7. Hook 実行順序: `notify-stop.sh` が先、reflection 系が後。reflection 系の失敗が notify を妨げない (各 entry 独立、set +e)。
8. Escape hatch: `/reflect` skill を手動実行用に維持。primary path ではないが、自動化が壊れたときの fallback。
9. wiki plugin co-existence: 現状 dormant、本 ADR では active conflict なし。将来 enable する場合は別 ADR で dedup contract を定める。

### Confirmation

- Stop hook 完了後、`~/.claude/projects/-Users-thkt--claude/knowledge/reflection/<session_id>.md` と `knowledge/activity/<session_id>.jsonl` が存在する。
- `reflection-index.jsonl` 末尾に当該セッションのエントリが追記されている。
- 次セッション起動時、SessionStart hook の stdout に直近 10 セッションの reflection が含まれる。
- `REFLECT_HOOK_SESSION=1` が export された subagent 上では reflection-extract.sh が即時 exit 0 を返す。
- `~/.claude/CLAUDE.md`、`~/.claude/rules/**/*.md`、`~/.claude/projects/-Users-thkt--claude/memory/MEMORY.md` のいずれも本機能によって書き換えられない (cache safety verification)。

### Consequences

- Stop hook の latency が増える (subagent 起動 + LLM 抽出)。budget 30s 内に収める設計責任が実装側に発生。
- 抽出された reflection に false positive が混じる前提で運用する。SessionStart は confidence tag で表示を調整するが、completely gate はしない。
- LLM コストが session ごとに発生 (subagent 起動 = 1 token 消費)。コスト監視は telemetry に乗せる将来課題。
- mechanical script が history.jsonl の schema 変更に追従する必要 (現状は `tool_input`/`tool_response`/`stop_reason` キー前提)。Claude Code 側の schema が変わると script 修正が要る。
- `knowledge/` ディレクトリ配下のファイル数が線形増加する。N=10 cap は stdout 注入 のみで、files は累積。半年ごとに archive を検討。

## More Information

- Related: ADR-0040 (wiki plugin v2 / 同じく Stop hook + ingest パターン), ADR-0067 (RULES / ADR / CLAUDE.md 境界の方針、本 ADR は scope=harness で hooks のルールを定める)
- Issue: thkt/dotclaude#37 (closed, design doc 完成)
- Research: `~/.claude/workspace/research/2026-05-07-knowledge-reflection-cache-safe-design.md`
- Motivation: Zenn 2026-05-02 Takami Torao "ソフトウェアの『設計原則』を、なぜ一部のエンジニアは生理的に嫌うのか" / Anthropic Thariq (2026-02-19) "Lessons from Building Claude Code: Prompt Caching Is Everything"
- Memory: `project_harness-investigation-quality.md`, `feedback_no-llm-self-confidence-as-gate.md`, `reference_hook-patterns-throttle-deferred.md`
- Future work: wiki plugin enable 時の dedup contract、reflection archive policy、subagent コスト telemetry

### Reassessment Triggers

- subagent 起動の LLM コストが telemetry で許容範囲を超えたとき
- 機械的な activity log だけで durable な外化資産が残ると実測できたとき
