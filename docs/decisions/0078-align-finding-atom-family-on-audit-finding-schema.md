---
status: "accepted"
date: 2026-06-19
decision-makers: thkt
---

# ADR-0078: finding atom family を audit finding-schema の共通コアに揃える

## Context and Problem Statement

adversarial な指摘を出すスキルは critic-design (issue/challenge が spawn)、audit reviewers、assert の enhancer-evidence の 3 系統。このうち audit reviewers の finding は finding-schema.md (Severity/Category/Location/Evidence/Trigger/Reasoning/Fix/Verification) を canonical 基盤に持ち、enhancer-evidence.findings[] は既にその projection (id/severity/source/location) で field レベルは揃っている。critic-audit / critic-evidence は finding を生成せず `{finding_id, verdict}` で裁定するだけなので atom を持たない。乖離しているのは critic-design の weakness schema (Viewpoint/Finding/Supporting evidence/Disconfirming probe) だけで、ここが finding-schema と語彙も粒度も無関係に進化している。同じ「重大度付きの一行欠陥」を別語彙で表すため、issue と challenge の出力を読む人間が audit/assert の出力と頭の中で対応付けられない。

## Decision Drivers

- critic-design だけが finding-schema と無関係な語彙で weakness を出し、認知の一貫性が崩れている
- proposal の weakness (コード未在) と code finding (file:line) は別物で、flat 統一は critic-design に埋められない欄を強制する
- 今はどのスキルも他スキルの finding を consume せず、共有するのは format であって data pipe ではない (相互参照は finding-id routing が前提)

## Considered Options

- Option 1: 共通コア (Severity / Evidence / 一行 claim / ID) + role 別 extension。各 producer はコアのサブセットを投影し、critic-design は disconfirming probe を extension に持つ
- Option 2: finding-schema へ flat 統一。critic-design も Location=file:line, Trigger を必須化
- Option 3: 統一しない。critic-design は独自語彙のまま

## Decision Outcome

Option 1 を採用する。issue/audit/assert/challenge の finding atom は audit finding-schema の共通コア (Severity / Evidence / 一行 claim / ID) を base format とし、各 producer は consume 形態でコアのサブセットを投影する。machine routing する enhancer-evidence は ID 含む投影、ephemeral な critic-design は Severity/Evidence/一行 claim を投影し ID/Location は出さない。role 固有の欄は extension に残す。この family 方針で実改修が要るのは critic-design のみ。audit reviewers は finding-schema を canonical に持ち、enhancer-evidence は projection 済み、critic-audit/critic-evidence は atom を出さず裁定するだけで、いずれも既に整合している。

### 共通コアと extension の境界

critic-design weakness は audit finding の共通コアのうち Severity / Evidence / 一行 claim を投影する。critic-design はこの語彙に寄せ、Finding を一行 claim に、Supporting evidence を Evidence に対応させる。ID は machine routing しない ephemeral な weakness では出さない。Viewpoint (攻撃レンズ) は finding 種別を表す Category とは別軸なので寄せず、critic-design 固有の extension に残す。乖離する欄は role 別 extension として両者が別々に持つ。

| 欄         | audit finding   | critic-design weakness         |
| ---------- | --------------- | ------------------------------ |
| 分類軸     | Category (種別) | Viewpoint (攻撃レンズ)         |
| Location   | `file:line`     | Finding 散文に埋込、専用欄なし |
| Trigger    | runtime 条件    | n/a (前提 X が偽なら、で代替)  |
| 検証モデル | ±20 行を読む    | disconfirming probe を立てる   |

### 判定 wrapper と transport は producer/consumer に残す

各スキルの top-level 判定は producer 固有出力として据え置く。challenge=GO/NO-GO、assert=Gate(Ready/NotReady) + Trust Score、audit=severity 集計、issue=preview の tentative/critic マーカー。transport も consumer が決める。machine decode で fail-close する assert は JSON authoritative block、人間がレビューする audit/challenge/issue は Markdown 表。語彙 (field 名) を揃えるのであって JSON か Markdown かは揃えない。

### Consequences

- Good, issue/challenge の出力が audit/assert と同じ Severity/Evidence/ID 語彙で読め、認知の対応付けコストが消える
- Good, finding-id routing (ADR-0077) を将来 critic-design 出力へ広げる際の field 基盤が既に揃う
- Bad, critic-design.md の出力 schema を改修し、Supporting evidence を Evidence へ rename する必要がある。Viewpoint / disconfirming probe は extension に残し、Severity は 3-level を維持。issue/challenge は consumer として追従するが本文 spawn 側の改修は最小

### Confirmation

family の base format は finding-schema の共通コア (Severity / Evidence / 一行 claim / ID)。各 producer は consume 形態でコアのサブセットを投影し、machine routing する enhancer-evidence は ID 含む投影、ephemeral な critic-design は Severity/Evidence/一行 claim のみ投影する。実改修は critic-design.md の Supporting evidence → Evidence rename のみで、Viewpoint / disconfirming probe を extension に残し ID/Location は出さないことを diff で確認する。Severity 3-level (critical なし) は projection の意図的制約。enhancer-evidence / audit reviewers は整合済みで変更せず、critic-audit/critic-evidence は atom 非生成で対象外。

## Pros and Cons of the Options

### Option 1 (共通コア + extension)

- Good, 共有する欄だけ揃え、proposal 固有の欄を critic-design に残せる
- Bad, core と extension の境界定義が必要で、finding-schema 側にも extension 節を足す

### Option 2 (flat 統一)

- Good, schema が単一で説明が要らない
- Bad, コード未在の proposal に file:line / runtime Trigger を強制し、critic-design が埋められない欄を捏造する誘因になる

### Option 3 (統一しない)

- Good, 改修コストゼロ
- Bad, critic-design だけ語彙が浮き、認知の対応付けコストが残り続ける

## More Information

本 ADR は format (field 語彙) の統一であって engine の統一ではない。challenge を全スキルの汎用 engine にはしない (allowed-tools に Bash がなく assert の code 実行検証を回せない)。OKF の「format not platform」に沿い、producer/consumer 分離と最小規約を保つ。

### References

- ADR-0077 (finding ID routing。finding-schema を audit/fix の共通参照として codify)
- skills/audit/references/finding-schema.md (canonical な Base Fields)
- agents/critics/critic-design.md (改修対象の weakness schema)
- agents/enhancers/enhancer-evidence.md (既に finding-schema の projection)

### Reassessment Triggers

- critic-design 以外にも共通コアへ収まらない producer が現れたとき
- スキル間で finding を実際に consume する経路ができ、format の共有だけでは足りなくなったとき
