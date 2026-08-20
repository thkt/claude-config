---
status: "superseded by DR-0055"
date: 2026-04-23
decision-makers: thkt
---

# ADR-0052: Unify skill naming with `use-*` prefix for CLI wrapper skills

## Context and Problem Statement

CLI ラッパー skill 群が命名パターンバラバラで、LLM discovery 時に「CLI ラッパー skill カテゴリ」として識別しにくい状態だった。

| Before              | パターン           | Trigger suffix |
| ------------------- | ------------------ | -------------- |
| yomu-search         | CLI 名 + 機能      | `-search`      |
| recall-search       | CLI 名 + 機能      | `-search`      |
| scout-search        | CLI 名 + 機能      | `-search`      |
| google-workspace    | ドメイン名         | なし           |
| utilizing-cli-tools | 動詞-ing + 複数CLI | なし（動名詞） |

問題:

1. 表面上は yomu/recall/scout が `-search` で揃ってるように見えるが、scout は search 以外の機能（fetch/research/repo-*）も持つ。「機能が偶然一致」のパターンで、規則ではない
2. google-workspace, utilizing-cli-tools は別パターン
3. LLM が「CLI ラッパー skill を列挙して」と聞かれても、共通の語彙がないため推論に頼る
4. feedback_skill-refactoring-policy.md (2026-04-20) は動詞-ing 削除方針を確立してたが、utilizing-cli-tools は動名詞で残ってた

## Decision Drivers

- LLM discovery の category identification 向上
- 命名パターンの one-of-a-kind 化（視覚的に CLI ラッパーと分かる）
- 動詞-ing 削除方針（feedback_skill-refactoring-policy.md）との整合
- 分解: utilizing-cli-tools を CLI 別 skill に分けて粒度統一

## Considered Options

### Option 1: `use-*` prefix 統一 + utilizing-cli-tools 分解（採用）

全 CLI ラッパー skill を `use-{cli-name}` に改名。複数 CLI を束ねてた utilizing-cli-tools は use-git / use-gh / use-npm に分解。

- Good: CLI ラッパー skill が視覚的に一列に並ぶ
- Good: 1 skill = 1 CLI の粒度統一
- Good: `use-` は前置詞扱いで動詞-ing 削除方針と共存
- Good: marketplace.json の skills 配列で CLI ラッパー群が明示的にグループ化可能
- Bad: 既存 `-search` suffix 喪失で、search 文脈の discovery trigger が description 依存に
- Bad: marketplace.json の path 破壊的変更（配布済みなら既存 install 破壊）
- Bad: mid-session rename で現 session の skill call が壊れる

### Option 2: `-search` suffix に統一

yomu-search/recall-search/scout-search に合わせ、google-workspace → gcloud-fetch、utilizing-cli-tools → git-cli/gh-cli/npm-cli。

- Good: 既存3 skill が維持できる
- Bad: 機能名 (`-search`, `-fetch`) を skill 名に埋め込むと多機能 CLI で破綻（scout が典型）
- Bad: 「CLI ラッパー」という共通カテゴリが依然識別困難

### Option 3: 現状維持

- Good: 破壊的変更なし、ADR 0045 との矛盾なし
- Bad: LLM discovery 精度改善機会の放棄
- Bad: utilizing-cli-tools の動名詞が方針違反で残り続ける

## Decision Outcome

Chosen: Option 1。`use-` 前置詞で CLI ラッパーを一括識別。

### 最終命名

| Before              | After                           |
| ------------------- | ------------------------------- |
| yomu-search         | use-yomu                        |
| recall-search       | use-recall                      |
| scout-search        | use-scout                       |
| google-workspace    | use-gcloud                      |
| utilizing-cli-tools | use-git, use-gh, use-npm (分解) |

### `use-` の semantic

動詞 base form ではなく前置詞扱い。「use-gcloud = gcloud を使うための skill」という関係を示す marker。feedback_skill-refactoring-policy.md の「動詞-ing 削除」は `verbing-noun` 型を禁止するが、`preposition-noun` 型は対象外。

### CHANGELOG ツールの所属

standard-version / release-it / semantic-release / changesets は npx 経由で実行する npm パッケージのため、use-npm 配下の references に吸収（独立 skill にしない）。

## Positive Consequences

- CLI ラッパー skill が name だけで視覚識別可能
- 1 skill = 1 CLI で粒度一貫
- feedback_skill-refactoring-policy.md 方針と整合
- marketplace.json の path 構造が CLI カテゴリを反映

## Negative Consequences

- `-search` 消失で search 用途の discovery が description 依存
- marketplace.json 破壊的変更（配布済み install 破壊）
- 27 ファイルの参照更新コスト（一度きり）
- mid-session rename で現 session の skill call 不可、restart 必要

## Scope

適用対象:

- skills/yomu-search → skills/use-yomu
- skills/recall-search → skills/use-recall
- skills/scout-search → skills/use-scout
- skills/google-workspace → skills/use-gcloud
- skills/utilizing-cli-tools → skills/use-git + skills/use-gh + skills/use-npm
- .ja/skills/ ミラー側も同等（use-scout は新規作成）

対象外:

- user-invocable: true の skill（命名は user が発火する slash command として独立）
- reviewing-* / *-reviewer ペア（skill + agent の役割別、ADR-0048 の scope）
- generator 系 (commit/checkout/pr/issue) (ADR-0048)

## Rollback Plan

Trigger Conditions:

- `use-*` prefix が LLM discovery に想定より悪影響（description 見落としが頻発）
- 新たな CLI ラッパー追加時に `use-` が意味通じないケース

Rollback Steps:

1. git revert で rename 回復（content 変更は edit の積み重ねで再適用）
2. marketplace.json を旧 path に戻す
3. 新 ADR で再変更の理由を記録

## Reassessment Triggers

- CLI ラッパー skill の追加/削除時
- Claude Code harness が skill discovery の name-based filtering を導入した時
- feedback_skill-refactoring-policy.md の命名方針が再定義された時

## Related ADRs

- [ADR-0004: スキル中心アーキテクチャへの再構成](0004-skill-centric-architecture-restructuring.md) - skill 命名の上位方針
- [ADR-0045: Replace /scout skill with scout-search CLI wrapper, retire scouting-anomalies](0045-replace-scout-skill-with-scout-search-cli-wrapper.md) - `scout-search` 命名部分のみ本 ADR が supersede。/scout 撤回と scouting-anomalies 撤回は維持
- [ADR-0048: Standardize generator skill structure](0048-standardize-generator-skill-structure.md) - generator 系 (commit/checkout/pr/issue) は本 ADR の対象外
- [ADR-0049: Consolidate skill-to-skill wrapper pairs](0049-consolidate-skill-to-skill-wrapper-pairs.md) - user-invocable skill 側の統合（本 ADR は CLI ラッパー側）

---

_Created: 2026-04-23_
_Author: thkt_
_ADR Number: 0052_
