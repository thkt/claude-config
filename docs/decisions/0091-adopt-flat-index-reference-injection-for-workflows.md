---
status: "accepted"
date: 2026-07-28
decision-makers: thkt
consulted: masuP9
---

# ADR-0091: リファレンス注入をフラットインデックスと glob 照合で決定的に行う

## Context and Problem Statement

UI 品質基準 A/B/C 実験 (Nikkei/ise-pl-app #2029、PR #2305-2307) で、ドメイン品質知識をワークフローへ渡す方法を比較した。抽象基準 9 項目を prompt に直接注入した v1 は、検証経路のない受け入れ基準が plan gate に 2 回連続却下され (コスト +23%)、「キーボードで完結」と明示されながら素の overflow-x-auto を書いた。原則と参照命令だけを注入し具体を repo 側リファレンスに分離した v3 は、ブラインド judge の判定を baseline 優位から逆転させ GO となった。

一方で ambient 配置 (置くだけ) では適用されない。baseline は規約に存在する tracking-label を落とし、v3 で具体が採用されたのは prompt が読む行為を命じたときだけだった (19 agent 中 6 体がツールで読了)。masuP9 の実走でも同型の失敗が独立に再現している。ドメイン知識の置き方と読ませ方を、build/code ワークフロー横断の規約として決める必要がある。

## Decision Drivers

- 読む行為は命令注入が必須。ambient 配置では適用されない (実験所見)
- リファレンスの発見を LLM の自発探索に任せると、探索スキップという脱落点が増え、読了の検証もできない
- ワークフローは流れだけを持ち、情報はリポジトリ側が持つ。リファレンス改訂がワークフロー改修から独立する
- 到達までの hop 数を最小にする。連鎖追跡は hop ごとに脱落確率を持つ

## Considered Options

- Option A: フラットインデックス + glob 照合。リポジトリ規約パスのインデックス 1 枚に「対象 glob + 1 行説明 + リファレンスパス」を列挙し、script が plan の `units[].files` と照合して読む命令を注入する
- Option B: colocated 配置 + walk-up 収集。対象サブツリー根に固定名で置き、script が触るファイルの祖先を走査して収集する
- Option C: 階層リンク。浅い文書が深い文書を紐付け、agent がリンクを辿る
- Option D: nested CLAUDE.md の自動読込に載せる
- Option E: ワークフロー prompt へ内容を直接注入する

## Decision Outcome

Option A を採用する。glob で判定できない横断的な行 (routes を触りながら UI を描く場合の UI 規約など) だけを 1 行説明によるモデル判断に残す。読み順は汎用が先、具体が後で、矛盾は具体が勝つ。置き場はプロジェクト接地情報 (実在資産・トークンの対応表) が docs、汎用だが選別したい情報 (検証観点のピック) が rules。agent が読むのはインデックスに載った行だけで、docs 全体は走査対象にならない。インデックスが 1 画面を超えたら注入過多の兆候として見張る。

Option E を退けた理由は、prompt に足すと既存指示が抜けること、および改訂のたびにワークフロー改修になること (v1 の失敗そのもの)。Option D は ambient 配置で適用されないという実験所見に反し、subagent での読込挙動も未検証。Option C は 2 hop 目以降の脱落が「インデックスは読んだが先を辿らなかった」として静かに起きる。Option B は A のインデックスに glob として吸収でき、独立に持つと機構が 2 本になるだけで退けた。audit ワークフローの glob-table routing (選定を script が握り drift させない) と同型のパターンである。

### Confirmation

code.js がインデックスの glob と `units[].files` の照合結果を実装 agent の prompt に列挙していること。注入されたリファレンスが transcript 上でツール読了されていること。採用後の UI issue の観察 run で、実装マーカー (指定部品・実在トークン) がリファレンスの該当行と一致すること。

### Consequences

- Good, because リファレンスの追加・改訂がインデックスへの行追記だけで発火し、ワークフローは非改修で済む
- Good, because 選定が script で決定的になり、読ませたのに読まれない失敗が注入漏れ (機械的に検出可能) に変換される
- Bad, because インデックスという単一の保守点が増え、glob と実配置のずれが注入漏れとして静かに現れる
- Bad, because 実験の GO は draftPlan 込み構成での証拠であり、本構成での効果は観察 run の確認待ち

## More Information

実験レポート 3 部 (report.md/report-v3.md/report-final.md、2026-07-28 時点で ~/Downloads)。実験 PR は Nikkei/ise-pl-app #2305 (baseline)/#2306 (v1)/#2307 (v3)。ADR-0089 (draftPlan 退役) により、レポート推奨の draftPlan 注入は plan 側 (/think 様式) と実装側 (code.js) への翻訳が必要になった。

### Reassessment Triggers

- インデックスと実配置の glob がずれ、注入漏れが実際に起きたとき
- 観察 run で本構成の効果が確認できず、実験の GO を引き継げないと分かったとき
