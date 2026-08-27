---
globs: ["**/workflows/**/*.js"]
scenes: ["pr-create"]
---

# 出力 schema の必須フィールド欠落は不安定な代替判定を誘発する

## 内容

agent へ渡す JSON Schema が `additionalProperties: false` で必要なフィールドを持たないと、そのフィールドを本来使うはずだった後続処理は、自己申告や自己採番など不安定な代替に頼る。正しい直し方は schema へフィールドを足すことで、後続側で頑張って推測させない。

## 定型手順

1. 後続処理が値を必要としているのに、agent へ渡す schema に対応するフィールドが無いかを確かめる
2. 無ければ、後続側で値を推測・自己申告させる代わりに、schema へフィールドを足す
3. フィールドを足したら、後続処理をそのフィールドを読む形に書き換える

## 参照コード

- `workflows/build.js` の `SHIP_SCHEMA`(PR 本文が skill 経由か記憶で書かれたかを示すフィールドを持たない)

## 根拠

- (research) audit の critic-audit/Integrate 分析で、当時の FINDINGS_SCHEMA が `finding_id` を持たず、critic-audit が自前で F-001.. を発番し、Integrate は file:line 照合しかできなかった
- (research) build の PR body 重複調査で、SHIP_SCHEMA が本文の出所(skill 経由か記憶で書いたか)を示すフィールドを持たず、skill を経由しなかった ship agent も自己申告失敗以外では検知できないと分かった
