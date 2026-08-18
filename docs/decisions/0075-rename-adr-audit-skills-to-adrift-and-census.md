---
status: "accepted"
date: 2026-06-13
decision-makers: thkt
---

# ADR-0075: Rename audit-adr-drift to adrift and audit-adr-gaps to census

## Context and Problem Statement

ADR-0070 は ADR を refactoring baseline にする姉妹 skill 2 つを `audit-adr-*` プレフィクスに揃え、name だけでペア関係を読めるようにした。しかし `audit-adr-drift` / `audit-adr-gaps` は冗長で、毎回 tab 補完しても長く、口頭でも指しにくい。user が短く記憶に残る名前を希望した。

`adrift` は "adr" + "drift" を内包し「漂流」の含意で「ADR と code がずれた」を一語で表す。`census` は「全数調査」で「未記録の設計判断を棚卸しして ADR 候補化する」役割を一語で表す。両者は共通プレフィクスを持たないが、それぞれが役割を自己説明する。

template select は naming 構造変更のため architecture-pattern として扱う。

## Decision Drivers

- 短く記憶に残る名前 (タイピング・口頭参照のコスト削減)
- 各 name が単体で役割を説明する self-documenting 性
- ペア関係は description と When to Use の相互参照で担保できる

## Considered Options

### Option 1: 両 skill を adrift / census に改名 (採用)

`audit-adr-drift` → `adrift`、`audit-adr-gaps` → `census`。

- Good: 1 語で短く、各 name が役割を内包する
- Good: adrift は "adr" 文字列を含み ADR 系と分かる
- Bad: 共通プレフィクスが消え、ls の前方一致でペアが並ばない
- Bad: 破壊的 rename (cross-ref 更新、mid-session 呼び出し不可)

### Option 2: drift のみ adrift に改名

- Good: 最小変更
- Bad: `adrift` + `audit-adr-gaps` で命名規則が混在し、ペアの一方だけ浮く

### Option 3: 現状維持 (ADR-0070 のまま)

- Good: 破壊的変更なし、プレフィクス対称性を保つ
- Bad: 冗長な名前が残る

## Decision Outcome

Chosen: Option 1。プレフィクス対称性 (ADR-0070 のドライバ) を、各 name の self-documenting 性とペア相互参照に置き換える。ADR-0070 の命名決定を supersede する。実行順序は状況依存のため name には込めず、両 skill の When to Use に条件付きフローとして残す。

### Confirmation

- `ls skills/` に `adrift` と `census` が存在し、旧名ディレクトリが消える
- 正典ファイル (skills, .ja/skills) に旧名 `audit-adr-drift` / `audit-adr-gaps` が残らない (ugrep 0 件)
- 両 SKILL の description と When to Use が相互に新名で参照する

### Positive Consequences

- skill 名が短く self-documenting になる
- ペア関係は name プレフィクスでなく本文の相互参照で明示される

### Negative Consequences

- 正典 SKILL 2 + census subdir 3 + .ja ミラー計 10 ファイルの更新 (一度きり)
- ADR-0070 / ADR-0072 本文と memory に旧名が残存 (歴史記録として据え置き)
- mid-session rename で現 session の skill 呼び出しは restart まで不可

## More Information

- Supersedes ADR-0070: 同 ADR の `audit-adr-*` プレフィクス対称性ドライバを置き換える。skill を別維持する判断 (ADR-0049 由来) は不変
- ADR-0052: `use-*` prefix 統一。user-invocable skill は対象外。本 ADR が user-invocable audit 系の命名を更新する

### Reassessment Triggers

- name だけで役割が伝わらない skill が増え、ペアの相互参照だけでは辿れなくなったとき
- 2 skill の役割が重なり、統合を検討する段になったとき
