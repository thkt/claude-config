# Fowler の Architecture Decision Records 論

Martin Fowler のブログ記事で ADR プラクティスを要約したもの。元のコンセプトは Michael Nygard (2011)。出典の語をそのまま引くので、このファイルでは ADR と呼ぶ。Fowler の ADR はこのスキルの DR のうちアーキテクチャ決定にあたり、以下の書き方は DR 全体に当てはまる。

## 中核定義

> An ADR is a short document that captures and explains a single decision relevant to a product or ecosystem.

通常は 1 ページ、最大でも 2 ページ。決定とその文脈、重要な波及効果を記録する。

## 2 つの目的

- 歴史的記録。将来の読み手が、なぜシステムが現状の形で構築されているかを理解する
- 思考の明確化。書くこと自体が意見の不一致を浮き彫りにし、解決を促す

## 文章スタイル

| 観点         | プラクティス                                     |
| ------------ | ------------------------------------------------ |
| 逆ピラミッド | 重要な情報を先頭に。補足は後ろに                 |
| 簡潔さ       | 1 ページが望ましい。補助資料は外部リンクで       |
| Markdown     | リポジトリに置き、コードと並べて diff 可能にする |

## 必須コンテンツ要素

| 要素         | 詳細                                                 |
| ------------ | ---------------------------------------------------- |
| Decision     | 採用した選択                                         |
| Rationale    | この結論に至った問題とトレードオフ                   |
| Alternatives | 真剣に検討した選択肢、それぞれ pros / cons 付き      |
| Consequences | rationale から自明でない場合は明示セクションを設ける |
| Confidence   | 決定時点での確信の度合い                             |
| Triggers     | 再評価を促す可能性のある状況変化                     |

## Advice Process

ADR は Advice Process の中心にある。ADR を書く行為は、単に選択を記録するだけでなく、チーム横断で専門知識を引き出し、合意を形成する手段としても使われる。
