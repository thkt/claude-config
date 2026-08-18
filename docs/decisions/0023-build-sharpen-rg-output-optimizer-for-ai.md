---
status: "proposed"
date: 2026-03-05
decision-makers: thkt
---

# ADR-0023: Build sharpen - rg output optimizer for AI consumption

## Context and Problem Statement

ripgrep (`rg`) の検索結果をそのまま AI（Claude
Code 等）に渡すと、トークンを浪費するノイズが多い。

具体的なノイズ:

1. **パス重複**: 同一ファイルから複数マッチ → パスが毎行繰り返される
2. **import 文**: 定義ではなく参照のみ。AI の理解に寄与しない
3. **コメント行**: マッチしても意味的価値が低い
4. **テストファイル**: `*.test.ts`, `*.spec.ts`
   等。本体コードの理解には不要なケースが多い
5. **長い行**: マッチ部分以外の長大な文字列

rg 自体にはこれらを AI 向けに最適化する機能がない。パイプで後処理するツールが必要。

## Decision Drivers

- AI エージェントへのコンテキスト効率（トークン削減）
- 既存ツールチェーン（RTK, yomu, recall）との一貫性
- Unix 哲学: 1つのことをうまくやる、パイプで組み合わせる
- 導入コストの最小化（`rg query | sharpen` だけで動く）

## Considered Options

### Option A: Shell script (sed/awk)

- 依存ゼロ
- パスに `:` を含む場合の解析が困難
- 拡張しにくい

### Option B: Rust CLI (single binary)

- RTK/yomu/recall と同じエコシステム
- パス解析が堅牢（`:` 対策）
- homebrew-tap で配布可能
- パイプ処理に適した性能

### Option C: rg --json + jq

- rg の構造化出力を活用
- jq の複雑なフィルタが必要
- AI 向け出力の柔軟性が低い

## Decision Outcome

**Option B: Rust CLI** を採用。

### Rationale

- 既存ツール群（yomu, recall, scout）と同じ言語・ビルド・配布パイプライン
- rg のテキスト出力を堅牢にパースできる
- clap による CLI 設計で将来のオプション追加が容易
- homebrew-tap への追加で即配布可能

## Technical Design

### Scope (MVP)

| Feature          | Description                                                      |
| ---------------- | ---------------------------------------------------------------- |
| Noise filter     | import 文、コメント行、テストファイルを除去                      |
| Path compression | 同一ファイルのパスを1回だけ表示                                  |
| Line trimming    | 長い行を切り詰め                                                 |
| CLI flags        | `--keep-imports`, `--keep-comments`, `--keep-tests` で除去を抑制 |

### Architecture

```text
stdin (rg output) → parse → filter → group-by-path → format → stdout
```

単一バイナリ、単一ファイル（~200行）。パイプ専用。

### Out of Scope (Future)

- 定義優先ソート（AST/言語知識が必要）
- 設定ファイル
- rg --json 入力対応

### Repository

- `~/GitHub/sharpen/` に新規作成
- `~/GitHub/homebrew-tap/` に Formula 追加

## Consequences

### Positive

- rg → AI パイプラインのトークン効率が向上
- 既存エコシステムに自然に統合
- 人間にも読みやすい出力（副次効果）

### Negative

- 新規バイナリの保守コスト（ただし ~200行と小規模）
- rg の出力フォーマット変更時に追従が必要

### Neutral

- RTK の grep リライトとは独立（RTK はコマンド置換、sharpen は出力変換）

## Reassessment Triggers

- rg 自体が AI 向けの出力整形を持ち、sharpen のトークン削減率が誤差になったとき
- パイプで組み合わせる使い方が崩れ、sharpen 自身に検索機能を求められ始めたとき
