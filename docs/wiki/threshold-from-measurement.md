---
globs: []
scenes: []
---

# 閾値と上限は実測値を根拠に決める

## 内容

閾値、tier、scope の値は、印象でなく測った値を根拠に決める。根拠が無いまま置いた値は、後から見直す契機も持たない。測れないまま決めるときは暫定と明示し、何を測れば見直せるかを同じ場所に書く。

## 定型手順

1. 決めたい値が何を防ぐためのものかを 1 文で書く
2. その防ぎたい状態を測る指標を決め、現状を測る
3. 測った値から閾値を決め、根拠をコードのコメントか issue へ書く
4. 測れないときは暫定値と明示し、再評価の契機になる測定を書く

## 参照コード

- `skills/scribe/scripts/triage.py` の `COMMIT_CAP`（暫定値と、見直しの契機を書いた例）
- `workflows/build.js` の `UNIT_CAPS`（unit あたりの files と tests の上限）

## 根拠

- #219 build の validate へ unit サイズ上限の縮小ゲートを追加した
- #220 plan 品質ゲートを強化し、textlint を commit メッセージへ対応させた
- #224 audit の critic 層を opus から sonnet へ切り替える trial
- #225 scribe の入力ソースへ workspace/research/ を追加した
