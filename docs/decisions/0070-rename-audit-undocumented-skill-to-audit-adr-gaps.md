---
status: "superseded by DR-0075"
date: 2026-06-13
decision-makers: thkt
---

# ADR-0070: Rename audit-undocumented skill to audit-adr-gaps

## Context and Problem Statement

`audit-adr-drift` と `audit-undocumented` は、ADR を refactoring baseline にするための姉妹 skill。前者は ADR Decision と code の drift を検出し、後者は ADR が無い決定を発掘して ADR 候補化する。だが命名が非対称で、drift 側は `audit-adr-*`、発掘側は `audit-*` のみ。name からペア関係が読めず、user が「わかりづらい」と指摘した。

template select script は technology-selection を返したが、本件は skill 命名構造の統一なので architecture-pattern として扱う。

## Decision Drivers

- ペア関係を name だけで視覚識別したい
- user-invocable skill の命名明確性
- 役割が別 (発掘 vs drift 検出) のため統合せず別 skill 維持

## Considered Options

### Option 1: audit-undocumented を audit-adr-gaps にリネーム、別維持 (採用)

両 skill を `audit-adr-*` に揃える。drift は既に適合済みのため維持。

- Good: name だけでペアと分かる
- Good: suffix gaps/drift が役割を対比 (gaps=ADR が無い, drift=ADR がずれた)
- Good: 最小変更 (off-pattern な発掘側のみ改名)
- Bad: 破壊的 rename (参照更新コスト、mid-session 呼び出し不可)

### Option 2: 2 skill を 1 つに統合

ADR 有無をモード分岐する単一 skill にする。

- Good: 境界の重複が消える
- Bad: 役割が別。ADR-0049 の caller/content-fit 基準でも別 skill が妥当
- Bad: user が別維持を希望

### Option 3: 現状維持

- Good: 破壊的変更なし
- Bad: 命名非対称が残り、name-based discovery が効かない

### Option 4: 順序を込めた命名 (audit-adr-1-gaps / audit-adr-2-drift)

- Bad: 実行順序は状況依存 (ADR あり → drift 先、ADR 無し → gaps 先)。固定番号は誤誘導になる

## Decision Outcome

Chosen: Option 1。`audit-adr-gaps` + `audit-adr-drift` のペアに統一する。実行順序は状況依存のため name には込めず、両 skill の When to Use に条件付きフローとして明示する。

### Confirmation

- `ls skills/ | grep audit-adr` で 2 skill が並ぶ
- 正典ファイルに旧名 `audit-undocumented` が残らない (ugrep 0 件)
- 両 SKILL の When to Use に ADR 有無での順序分岐が記載される

### Positive Consequences

- ペア skill が name で識別可能になる
- ADR-0052 の「prefix で skill カテゴリを視覚化」論理を user-invocable audit 系へ適用

### Negative Consequences

- 正典 7 ファイル + .ja ミラー 2 ファイルの更新 (一度きり)
- ADR-0067 本文と sae リポ memory に旧名が残存 (歴史記録として据え置き)
- mid-session rename で現 session の skill 呼び出しは restart まで不可

## More Information

- ADR-0052: `use-*` prefix 統一。user-invocable skill は対象外と明記。本 ADR が user-invocable audit 系の命名を別途決定する
- ADR-0049: skill 統合基準 (caller / content-fit)。本件で統合しない判断の根拠
- framing 非対称 (audit-adr-drift に critic-design challenge が無い) と External ADR cross-check の重複は本 ADR のスコープ外。別 follow-up として扱う
