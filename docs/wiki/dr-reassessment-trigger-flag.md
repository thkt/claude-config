---
globs: ["**/docs/decisions/*.md"]
scenes: ["plan"]
---

# ADR の reassessment trigger 充足を research が検知したら明記する

## 内容

research や調査の過程で、ある DR の reassessment trigger(再評価すべき条件)が実際に充足したと分かったら、その旨を明記して運用側へフィードバックする。気づいたまま埋もれさせると、DR は古い前提のまま参照され続ける。

## 定型手順

1. 調査対象が依拠する DR の Reassessment Triggers を確認する
2. 調査で判明した事実がそのいずれかを満たすかを照合する
3. 満たしていれば、どの trigger がどう充足したかを finding として明記する
4. 明記した finding は、DR の再評価判断に使えるよう issue やレビューへ引き継ぐ

## 参照コード

- `docs/decisions/0058-inline-single-consumer-agent-context-skills-into-agents.md` の `### Reassessment Triggers`(research が照合する対象の節。112 件中 103 件の DR がこの節を持つ)

## 根拠

- (research) reviewer 構造調査で、ADR-0058 の reassessment trigger(複数 consumer だった skill が単一 consumer 化)が充足していることを検知した
- (research) issue-53 aiano annotation framework 調査で、ADR-0002 の reassessment trigger(charter creep)が充足していることを検知した
