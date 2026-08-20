---
status: "accepted"
date: 2026-02-07
decision-makers: thkt
---

# IDR生成システムの外部リポジトリ化（Rustバイナリ）

## Context and Problem Statement

IDR（Implementation Decision Record）生成システムが `~/.claude/hooks/lifecycle/` 内のシェルスクリプト群として実装されている。これは他プロジェクトへの導入が困難で、jaq への外部依存もある。claude-guardrails のように独立したツールとして配布可能にしたい。

## Decision Drivers

- 他プロジェクトへの導入しやすさ（`brew install` で完結）
- jaq 依存の除去（インストールの簡素化）
- claude-guardrails との一貫性（同じ配布パターン）
- テスト容易性（シェルスクリプトのテスト困難さ）
- セッションログ解析の信頼性向上

## Considered Options

1. Shell パッケージ（installer スクリプト方式）
2. Rust バイナリ（guardrails 同型）
3. シェル + Rust ハイブリッド

## Decision Outcome

Chosen option: "Rust バイナリ", because claude-guardrails と同じ配布パターンを採用することで、brew tap の共有、CI ワークフローの再利用、jaq 依存の除去が実現できる。

### Consequences

#### Positive Consequences

- `brew install thkt/tap/claude-idr` で導入完結
- jaq 不要（JSON パースは serde_json で内包）
- guardrails と CI/release ワークフローを共有可能
- ユニットテスト・統合テストが書きやすい
- クロスプラットフォームビルド（macOS/Linux, x86/ARM）

#### Negative Consequences

- Rust でのリライトコスト
- シェルスクリプトより保守者のスキル要件が上がる
- claude CLI 呼び出しは subprocess のまま（ボトルネック変わらず）

## Pros and Cons of the Options

### Shell パッケージ

シェルスクリプトを self-contained にリファクタし、installer で `~/.claude/hooks/` に配置する。

- Good, because 開発コスト最小（既存コードのリファクタのみ）
- Good, because Bash 知識だけで保守可能
- Bad, because jaq 依存が残る
- Bad, because テストが困難
- Bad, because guardrails との一貫性がない

### Rust バイナリ

guardrails と同じパターンで、stdin からフック入力を受け取り、IDR を生成する単一バイナリ。

- Good, because guardrails と同じ配布・CI パターンを再利用
- Good, because jaq 依存を除去（serde_json で JSON パース）
- Good, because 型安全でテスト容易
- Good, because single binary で依存なし
- Bad, because Rust リライトのコスト
- Bad, because 保守者に Rust 知識が必要

### シェル + Rust ハイブリッド

エントリポイントはシェル、セッション解析部分のみ Rust バイナリ。

- Good, because 段階的に移行可能
- Good, because シェルの柔軟性を維持
- Bad, because 2言語混在で保守性低下
- Bad, because 配布が複雑（スクリプト + バイナリ）

## Architecture

### Component Mapping

| Current (Shell)         | New (Rust)     |
| ----------------------- | -------------- |
| `idr-pre-commit.sh`     | `main.rs`      |
| `_utils.sh`             | `session.rs`   |
| `_context-extractor.sh` | `context.rs`   |
| `resolve-idr-path.sh`   | `path.rs`      |
| `next-idr-number.sh`    | `numbering.rs` |
| IDR format (in prompt)  | `prompt.rs`    |
| -                       | `config.rs`    |

### Integration Points

```text
git commit
  → git pre-commit hook
    → claude-idr (Rust binary)
      → reads git diff (subprocess: git)
      → reads session log (direct file I/O, no jaq)
      → calls claude CLI (subprocess: claude -p)
      → writes IDR file
```

### Configuration

`~/.config/claude-idr/config.json`:

```json
{
  "enabled": true,
  "language": "ja",
  "output_dir": "auto",
  "model": "sonnet",
  "open_after_generate": true
}
```

## Rollback Plan

**Trigger Conditions**:

- Rust ビルド環境のメンテナンスコストが予想以上
- claude CLI の API 変更で subprocess パターンが非実用的に

**Rollback Steps**:

1. 現行シェルスクリプトを `~/.claude/hooks/lifecycle/` に復元
2. jaq を再インストール
3. この ADR の Status を Deprecated に更新

## Related ADRs

- [ADR-0006: Adopt Deterministic Script Pattern](0006-adopt-deterministic-script-pattern.md) - scripts/ パターンの前身

---

_Created: 2026-02-07_
_Author: thkt_
_ADR Number: 0009_

## Reassessment Triggers

- brew 配布のバイナリ更新がハーネス側の変更に追いつかず、機能を止めるようになったとき
- セッションログの形式が変わり、Rust 側を追随させるコストがシェル版を上回ったとき
