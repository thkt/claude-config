---
status: "superseded by DR-0042"
date: 2026-01-27
decision-makers: thkt
---

# Adopt Deterministic Script Pattern

Technical Story: [Claude Code SKILL.md 肥大化対策パターン](https://zenn.dev/playpark/articles/41a5dab35a6f97)

## Context and Problem Statement

SKILL.mdファイルやhooksスクリプト内に、毎回AIが再解釈している決定論的処理（日付計算、番号採番、パス解決など）が散在している。これによりSKILL.mdが肥大化し、同じロジックが複数箇所で重複実装されている。

## Decision Drivers

- SKILL.mdの肥大化（500行超のファイルが発生）
- AIが毎回同じ処理を再解釈するトークンコスト
- 複数箇所での重複実装（DRY原則違反）
- エラーの発生しやすさ（手書き正規表現の誤りなど）
- 保守性の低下（ルール変更時に複数箇所を修正）

## Considered Options

1. 現状維持（SKILL.md / hooks内に直接記述）
2. scripts/ディレクトリにBashスクリプトとして外出し
3. TypeScript/JavaScriptでユーティリティ化

## Decision Outcome

Chosen option: "scripts/ディレクトリにBashスクリプトとして外出し", because 既存のhooksエコシステムとの親和性が高く、Claude Codeの実行環境（Bash）で直接呼び出せる。既存の空ディレクトリを活用。

### Consequences

#### Positive Consequences

- SKILL.mdは「何を呼ぶか」だけの記述に簡素化
- 決定論的処理の一元管理（1箇所修正で全体に反映）
- AIプロンプト削減（推定40%減）
- テスト可能（スクリプト単体でテスト可能）

#### Negative Consequences

- scripts/ディレクトリの管理コスト増加
- スクリプトの学習コスト（新規参入者）
- クロスプラットフォーム対応の考慮（macOS/Linux）

## Pros and Cons of the Options

### 現状維持

SKILL.md / hooks内に決定論的処理を直接記述し続ける。

- Good, because 追加の学習コストなし
- Good, because ファイル構成がシンプル
- Bad, because SKILL.mdが肥大化し続ける
- Bad, because 同じ処理が複数箇所で重複

### scripts/ディレクトリにBashスクリプト外出し

決定論的処理を独立したBashスクリプトとして切り出し、SKILL.mdやhooksから呼び出す。

- Good, because 既存のBash環境でそのまま動作
- Good, because hooksとの統一性（同じ実行モデル）
- Good, because シンプルな入出力（stdin/stdout）
- Bad, because Bashの制約（複雑なデータ構造の扱い）
- Bad, because クロスプラットフォーム対応が必要

### TypeScript/JavaScriptユーティリティ化

Node.jsモジュールとして実装し、ts-node等で実行。

- Good, because 型安全
- Good, because 複雑なロジックも記述しやすい
- Bad, because Node.js依存（実行環境の制約）
- Bad, because hooksとの実行モデルの不一致

## Process Change Details

### Current Process

決定論的処理がSKILL.mdやhooks内に直接記述されている。

```bash
# 例: hooks/lifecycle/idr-pre-commit.sh内の番号採番
get_next_idr_number() {
  local idr_dir="$1"
  local max_num=0
  while IFS= read -r -d '' f; do
    num=$(basename "$f" | sed -n 's/\.idr-\([0-9]\{1,\}\)\.md$/\1/p' | sed 's/^0*//')
    ...
  done < <(find "$idr_dir" -maxdepth 1 -name ".idr-*.md" -print0 2>/dev/null)
  printf "%02d" $((max_num + 1))
}
```

**Pain Points**:

- 同様の採番処理がADR、IDR、汎用IDで重複
- AIが毎回同じ正規表現パターンを再解釈
- 修正時に複数ファイルを更新する必要

### New Process

決定論的処理を`scripts/`ディレクトリのスクリプトに切り出し、SKILL.mdやhooksは呼び出しのみ行う。

```bash
# SKILL.mdやhooksからの呼び出し
NEXT_NUM=$("$HOME/.claude/scripts/next-idr-number.sh" "$IDR_DIR")
```

**Expected Improvements**:

- SKILL.mdは「何を呼ぶか」だけの記述（42行以下を目標）
- 1箇所修正で全体に反映
- スクリプト単体でのテストが可能

### Transition Plan

| Phase   | Activities                        | Success Criteria   |
| ------- | --------------------------------- | ------------------ |
| Phase 1 | 優先度高の5スクリプト実装         | 基本動作確認       |
| Phase 2 | 既存hooks/SKILLからの呼び出し移行 | 重複コード削除     |
| Phase 3 | 残り8スクリプトの段階的実装       | 全15スクリプト完了 |

## Scope

### スクリプト化対象の判断基準

| 基準             | 説明                           |
| ---------------- | ------------------------------ |
| 入力→出力が一定  | 同じ入力に対して常に同じ出力   |
| AIの創造性が不要 | 判断・生成が必要ない処理       |
| 複数箇所で使用   | 2箇所以上で同じ処理が必要      |
| ルールが明確     | if A then B のような決定的処理 |

### 対象スクリプト一覧

| Priority | Script                     | Purpose                 |
| -------- | -------------------------- | ----------------------- |
| 高       | `next-adr-number.sh`       | ADR番号採番             |
| 高       | `next-idr-number.sh`       | IDR番号採番             |
| 高       | `slugify.sh`               | タイトル→スラグ変換     |
| 高       | `select-adr-template.sh`   | ADRテンプレート選択     |
| 高       | `should-update-codemap.sh` | コードマップ更新判定    |
| 中       | `detect-project-type.sh`   | プロジェクトタイプ検出  |
| 中       | `detect-frameworks.sh`     | フレームワーク検出      |
| 中       | `find-config-root.sh`      | プロジェクトルート検索  |
| 中       | `resolve-idr-path.sh`      | IDRパス解決             |
| 中       | `get-src-dir.sh`           | src/appディレクトリ検出 |
| 低       | `next-id.sh`               | 汎用ID生成              |
| 低       | `iso-timestamp.sh`         | ISOタイムスタンプ生成   |
| 低       | `is-matching-extension.sh` | 拡張子判定              |

## Directory Structure

```text
.claude/
└── scripts/                      # 既存ディレクトリを活用
    ├── next-adr-number.sh
    ├── next-idr-number.sh
    ├── slugify.sh
    ├── select-adr-template.sh
    ├── should-update-codemap.sh
    ├── detect-project-type.sh
    ├── detect-frameworks.sh
    ├── find-config-root.sh
    ├── resolve-idr-path.sh
    ├── get-src-dir.sh
    ├── next-id.sh
    ├── iso-timestamp.sh
    └── is-matching-extension.sh
```

## Script Convention

| 項目               | 規約                                  |
| ------------------ | ------------------------------------- |
| Shebang            | `#!/bin/bash`                         |
| エラーハンドリング | `set -euo pipefail`                   |
| ヘッダーコメント   | 用途、入力、出力を明記                |
| 入力               | コマンドライン引数（`$1`, `$2`, ...） |
| 出力               | stdout（結果）、stderr（ログ/エラー） |
| 終了コード         | 0=成功、1=エラー                      |

```bash
#!/bin/bash
# 用途: 次のADR番号を計算
# 入力: ADRディレクトリパス
# 出力: 0001形式の次の番号
set -euo pipefail

adr_dir="${1:-.}"
# ...
```

## Confirmation

### Success Criteria

- SKILL.mdファイルが100行以下に削減
- 重複コードが0箇所
- 全スクリプトが単体テストをパス

### Metrics

| Metric               | Before | Target |
| -------------------- | ------ | ------ |
| SKILL.md平均行数     | 150+   | <100   |
| 重複処理箇所         | 15     | 0      |
| AIプロンプトトークン | 100%   | 60%    |

## Rollback Plan

**Trigger Conditions**:

- スクリプト呼び出しがhooksのパフォーマンスを著しく低下させる
- クロスプラットフォーム対応が困難と判明

**Rollback Steps**:

1. scripts/内のスクリプト呼び出しをインライン展開に戻す
2. scripts/ディレクトリ内のスクリプトを削除
3. このADRのStatusをDeprecatedに更新

## Related ADRs

- [ADR-0001: Code Command Responsibility Separation](0001-code-command-responsibility-separation.md)
- [ADR-0004: Skill-Centric Architecture Restructuring](0004-skill-centric-architecture-restructuring.md)

## References

- [Claude Code SKILL.md 肥大化対策パターン](https://zenn.dev/playpark/articles/41a5dab35a6f97)
- [MADR Format](https://adr.github.io/madr/)

---

_Created: 2026-01-27_
_Author: thkt_
_ADR Number: 0006_
