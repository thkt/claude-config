# 変更起因でないテスト失敗の明示

## 内容

PR の verify でテストが失敗したとき、その PR の変更に起因しないものは、いつから赤か、なぜこの PR の対象外かを verify 節に書く。分類は推測でなく、分岐点の commit で同じテストを実行して確認する。env 変数や手動受け入れを要求する意図的な gate は、解除条件まで書く。

## 定型手順

1. verify でテストが失敗したら、分岐点の commit で同じテストを実行する
2. そこでも失敗するなら変更起因ではない。verify 節に、いつから赤か、なぜこの PR の対象外かを書く
3. 意図的な gate (env 変数や手動受け入れ待ち) は、gate であることと解除条件を書く
4. 変更起因の失敗と件数を分けて書く

## 根拠

- #167 #178 #179 #180 変更起因でない fail を verify 節で切り分ける運用の初出
- #214 19 fail のうち 1 件を「37fc4a7b とは無関係な設計上の失敗」と分類し、残り 18 件を no-repo gate 起因として切り分けた
- #220「失敗 1 件は ADR0085_MANUAL_ACCEPTANCE 環境変数を要求する既存の manual gate」と How to Test に明記した
- #222 verify 出力に「deliberate manual-acceptance gate、not a code defect、no fix was attempted」と記録した
- #226「fail 2 件は EN/JA 同一の manual acceptance gate で、変更前から赤」と明記した
