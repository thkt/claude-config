---
status: "accepted"
date: 2026-03-10
decision-makers: thkt
---

# ADR-0024: Adopt two-layer Delta for compaction resilience

## Context and Problem Statement

compaction後に「さっき決めたこと」が消える。SOW/Specは計画時点の決定をカバーするが、実装中の発見・対処・設計変更（=
Delta）がcompactionで失われる。

Harness Engineeringのベストプラクティス（GSD, nyosegawa記事）ではContext Pruning
/ Fractal
Summariesでこの問題に対処しているが、現在の .claude/ ハーネスにはこの仕組みがない（harness-gaps.md
Gap 1）。

### compact の種類による違い

| 種類                | トリガー                   | 事前介入 | 要約方向付け                |
| ------------------- | -------------------------- | -------- | --------------------------- |
| manual (`/compact`) | ユーザー明示               | 可能     | `/compact [フォーカス指示]` |
| auto                | コンテキスト枯渇で自動発動 | 不可     | なし                        |

## Decision Drivers

- compaction後のコンテキスト復元品質
- manual/auto compactの性質の違いへの対応
- 外部API依存の排除（コストゼロ、ネットワーク不要）
- 既存hookパターン（idr-pre-commit.sh）との整合

## Considered Options

### Option A: PreCompact hook + SessionStart hook（状態ファイル方式）

PreCompact hookでtranscript行数を状態ファイルに記録 →
SessionStart(compact)で読んでDelta生成指示を注入。

- manual/auto両方で同じ処理
- 状態ファイルの管理が必要（行数トラッキング、2回目以降の境界管理）
- compact前のフルコンテキストを活用できない

### Option B: 外部CLI + Claude API

PreCompact hookから外部CLIを呼び、Claude APIでtranscriptからDelta抽出。

- ネットワーク依存、APIコスト、レイテンシ
- 品質検証なし（別インスタンスが生成）
- devil's advocateで却下済み

### Option C: 二層 Delta（/delta スキル + SessionStart フォールバック）

Layer 1: `/delta` スキルでフルコンテキストからDelta生成 → ユーザーが `/compact`
実行。Layer 2: auto-compact時のみSessionStart(compact)
hookがtranscriptからDelta生成指示を注入。

- manual compact: Claude自身がフルコンテキストから直接Delta生成（最高品質）
- auto compact:
  transcript再読によるフォールバック（品質は劣るがゼロより遥かに良い）
- compact_boundary subtypeでmanual/autoを判別（状態ファイル不要）

## Decision Outcome

**Option C: 二層 Delta** を採用。

### Rationale

- manual/autoの性質の違いに最適化した設計
- Layer 1はフルコンテキストから直接生成 → transcript再読不要で最高品質
- Layer 2は `compact_boundary`
  subtype（transcript内のマーカー）を利用 → 状態ファイル・行数トラッキング不要
- 外部API依存ゼロ（Claude Code本体or additionalContext注入で完結）
- compactionが「怖いこと」から「積極的に使えるツール」に変わる

### Key Technical Decisions

| Decision           | Choice                                   | Rationale                                    |
| ------------------ | ---------------------------------------- | -------------------------------------------- |
| manual compact対応 | /delta スキル（フルコンテキスト）        | 事前介入可能。最高品質                       |
| auto compact対応   | SessionStart(compact) hook               | 事前介入不可。フォールバック                 |
| compact種別判定    | compact_boundary.compactMetadata.trigger | transcript内のマーカーで判別。外部状態不要   |
| Delta出力先        | workspace/delta/delta.md（上書き）       | 最新のみ保持。YAGNI                          |
| PreCompact hook    | 不採用                                   | compact_boundaryで代替可能。状態管理が不要に |

## Technical Design

### Architecture

```text
Layer 1 (manual compact):
  User → /delta → Claude writes Delta from context → /compact

Layer 2 (auto compact):
  auto-compact → compact_boundary(trigger:"auto") written to transcript
  → SessionStart(compact) hook fires
  → grep transcript for compact_boundary
  → trigger=="auto" → inject additionalContext
  → Claude reads transcript range → generates Delta
```

### compact_boundary エントリ

transcriptのJSONLに記録される区切りマーカー:

```json
{
  "type": "system",
  "subtype": "compact_boundary",
  "compactMetadata": {
    "trigger": "manual" | "auto",
    "preTokens": 137242
  }
}
```

### 成果物

| ファイル                                 | 役割                                 |
| ---------------------------------------- | ------------------------------------ |
| skills/delta/SKILL.md                    | Layer 1: /delta スキル               |
| hooks/lifecycle/session-start-compact.sh | Layer 2: auto-compact フォールバック |
| settings.json                            | SessionStart(compact) hook登録       |

## Consequences

### Positive

- compaction後のコンテキスト復元が可能になる
- manual compact時はフルコンテキストから高品質Delta生成
- auto compact時もフォールバックでDelta確保
- セッション切替なしでSOW → Spec遷移が可能に（/delta → /compact）
- 外部依存ゼロ、既存hookパターンに沿った実装

### Negative

- auto compact時のDelta品質はtranscript再読に依存（Layer 1より劣る）
- /delta実行忘れ + manual compactの場合、Deltaが生成されない

### Neutral

- Gap 2（セッション間状態管理 / HANDOFF.md）とは独立。Gap 2は別途対応
- IDR（人間向け実装記録）とDelta（エージェント向けコンテキスト復元）は別目的で共存

## Reassessment Triggers

- compaction の仕様が変わり、manual と auto の性質差という二層の前提が消えたとき
- Delta の復元品質が実測で足りず、外部 API を使う設計と比べる段になったとき
