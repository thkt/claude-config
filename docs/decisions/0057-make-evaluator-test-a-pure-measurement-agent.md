---
status: "deprecated"
date: 2026-05-01
decision-makers: thkt
---

# Make evaluator-test a Pure Measurement Agent

> Deprecated 2026-07-05: the evaluator-test agent was removed, and the Spec-conformance role moved to reviewer-conformance wired into build.js Audit. No successor DR records that move.

## Context and Problem Statement

evaluator-test agent は 5 metrics (coverage / excess / duplication / granularity / intent) に weight 30/20/20/15/15 を掛けた composite score (0-100) を出力し、consumer (/code workflow) はこれを ≥70 で gate 判定している。weight 配分は「Coverage が一番重要」という主観的判断で、agent が judgment を内包している状態。

「measure, don't judge」の原則からすると、agent は raw metrics と全 findings を渡す側、consumer が gate threshold を持つ側、という役割分担が望ましい。composite score の weight 配分自体が judgment であり、weight が agent に hardcode されているため consumer が override できない。「主観で問題を切り落とす」リスクがある。

agent の責務をどこまで絞り、consumer に判断を委ねるべきか。

## Decision Drivers

- agent が judgment を内包すると consumer の用途別調整ができない
- weight の根拠が「project convention」程度の弱さで説明可能性に欠ける
- composite score の単一閾値判定で個別 metric の問題が見えなくなる

## Considered Options

- A. Composite Score 削除、consumer に gate logic 委譲
- B. 等価重み (各 metric 20)
- C. weight を Input field 化
- D. 現状維持 + Rationale 列復活

## Decision Outcome

Chosen option: "A. Composite Score 削除、consumer に gate logic 委譲", because agent を pure measurement specialist 化することで weight の主観を排除し、consumer が用途別に閾値設計できるようになる。

具体的な変更ファイル.

| File                                                 | 変更                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| agents/evaluators/evaluator-test.md                  | Composite Scoring セクション削除、Output から Total / Weighted 列削除 |
| skills/code/SKILL.md                                 | "Test Quality ≥70" を 5 metrics 複合条件 gate に書き換え              |
| skills/use-workflow-code/SKILL.md                    | 同上                                                                  |
| skills/use-workflow-code/references/code-workflow.md | 同上                                                                  |

consumer の閾値値は別途定める。初期案: Coverage ≥0.8, Excess ≤0.1, Duplication ≤0.2, Granularity ≥0.7, Intent ≥0.7。

### Consequences

- Good, because agent が pure measurement specialist になり judgment を完全排除
- Good, because consumer が metric ごとに閾値調整可能で用途別 gate 設計ができる
- Good, because weight 主観が排除され説明可能性が向上
- Bad, because consumer 側 4 ファイルの改修が必要
- Bad, because 単一閾値 70 から複合条件への移行で運用が複雑化

### Confirmation

evaluator-test の Output template に Total / Weighted 列がないこと、consumer skill の Quality Gate 記述が複合条件形式になっていることをコードレビューで確認。

## Pros and Cons of the Options

### A. Composite Score 削除、consumer に gate logic 委譲

agent は 5 raw metrics + 全 findings のみ出力。consumer が複合条件で gate 判定。

- Good, because agent の judgment を完全排除
- Good, because consumer が用途別に閾値設計できる
- Good, because weight の主観が消える
- Bad, because consumer 4 ファイル改修必要

### B. 等価重み (各 metric 20)

5 metric × 20 で composite 100、weight に偏り無し。

- Good, because weight 配分の主観が「等価」で中立化
- Good, because consumer 影響最小
- Bad, because 「等価が正しい」も主観
- Bad, because composite の judgment 性は残る

### C. weight を Input field 化

agent default weight 持ちつつ、consumer が weight 渡せるようにする。

- Good, because consumer が用途別に weight 調整可能
- Bad, because API 拡張で consumer 改修が必要
- Bad, because agent default weight の主観は残る

### D. 現状維持 + Rationale 列復活

weight 30/20/20/15/15 を維持、Rationale 列で「project convention」と正当化。

- Good, because consumer 影響なし
- Bad, because judgment が agent に残る
- Bad, because Rationale の根拠が convention 程度の弱さ

## More Information

### Architecture Diagram

```mermaid
graph TD
    Test[Test files] --> EVAL[evaluator-test]
    Spec[Spec T-NNN] --> EVAL
    EVAL -->|raw metrics + findings| CONSUMER[/code workflow]
    CONSUMER -->|complex threshold gate| DECISION{Pass / Fail}
```

### Quality Attributes

| Attribute             | Priority | Approach                               |
| --------------------- | -------- | -------------------------------------- |
| Single Responsibility | High     | agent は measurement 専念              |
| Configurability       | High     | consumer が閾値設計を持つ              |
| Explainability        | Medium   | weight 主観排除、metric は数式で説明可 |

### Trade-offs

agent が judgment を返さなくなるため consumer 側の閾値設計コストが増える。代わりに用途別の gate 設計が可能になる。

### Reassessment Triggers

- 閾値値の調整が頻繁に必要になり consumer ごとに違う閾値が必要になった場合は C (Input field) への移行を検討
- consumer 改修コストが想定より高い場合は B (等価重み) への後退を検討
