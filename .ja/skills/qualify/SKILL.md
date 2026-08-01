---
name: qualify
description: issue が build に投入できる形かを検分し、verdict (build-ready / needs-plan / needs-fix) と指摘を返す。起票には使わない (/issue)。PR のスクリーニングには使わない (/preview)。
when_to_use: 実装可否, build-ready 判定, issue 品質チェック, qualify issue, check issue before build
allowed-tools: Bash(gh issue view:*) Bash(ugrep:*) Bash(bfs:*) Read AskUserQuestion
model: opus
argument-hint: "[issue number or URL]"
---

# /qualify - issue の build 投入可否を検分

issue を build に渡す前に検分し、投入して進むか、先に手を入れるかを返す。build が Load 段で止まる条件は build.js が持つので、この skill に複製せず実行時に読む。判断が要る指摘は仮説付きの質問にしてユーザーへ返す。

## 入力

`$ARGUMENTS` は issue 番号か URL。空なら AskUserQuestion で対象を尋ねる。

## Phase 1: 取得

`gh issue view <ref> --json number,title,body,labels` で本文とラベルを取る。取得に失敗したら ref を報告して停止する。

## Phase 2: Plan 契約の検分

`## Plan` 節が無ければ、それ以上検分せず verdict を needs-plan にして Phase 4 へ進む。着手の判断は変わらないが、次の手は issue の種別で変わる。title が `[Bug]` なら、本文に原因の言明があるかを見て、無ければ次の手を「原因を特定してから plan を書く」にする。それ以外の種別は次の手が「plan を書く」のままなので、他の指摘を並べても判断は変わらない。

Plan 節があるときは、build.js の判定条件を書き写さず実行時に読んで適用し、違反した項目をすべて blocker として扱う。build が同じ条件で止まるため、advice に落とさない。

1. `ugrep -n "const validate = |const UNIT_CAPS = |const oversizedUnits = " ~/.claude/workflows/build.js` で位置を特定する
2. Read でヒットした箇所を読む
3. issue 本文の Plan 節を読んだ条件に当てて、違反を列挙する

### id クロスチェック

build は本文の U-NNN と T-NNN の id 集合を抽出結果と厳密比較する。qualify は抽出を行わないので、代わりに本文側の id が一意で連番になっているかを見る。id は `### U-NNN` で始まる行と、リストマーカー直後の `T-NNN` から集める。重複と欠番は blocker。

## Phase 3: 形式と前提の検分

issue の書式が `/issue` の出力形式に沿うか、plan の前提が現在のコードと噛み合うかを見る。検査する軸は次の表のものに限り、軸を足さない。AC が検証不能なら、実装した結果が正しいかを誰も判定できず、build の conformance も照合先を失う。「エラーがスクリーンリーダーに通知される」は通り、「UX が改善される」は通らない。新規作成先に既存ファイルがあると、build のどの段もそれを見ないまま上書きへ進む。preconditions の実在は build の Revalidate が正なので、ここでの照合は build で止まる可能性の予告として advice に置く。

| 軸                   | 通る条件                                                         | 重大度  |
| -------------------- | ---------------------------------------------------------------- | ------- |
| title の種別         | `[Feature]` / `[Bug]` / `[Docs]` / `[Chore]` のいずれかで始まる  | advice  |
| What & Why           | 誰の何の痛みかと、その根拠が書かれている                         | advice  |
| AC の検証可能性      | 各項目が観測可能な結果を述べ、達成の判定者が人間の主観に依らない | blocker |
| tentative マーク     | 未決の判断に `(tentative: <着手時のアクション>)` が付く          | advice  |
| priority ラベル      | `priority:critical` / `high` / `medium` / `low` のいずれかが付く | advice  |
| preconditions の実在 | 各 {path, pattern} が現在のコードで見つかる                      | advice  |
| 新規作成の衝突       | contract が新規作成と読める files が、まだ存在しない             | blocker |

## Phase 4: verdict と出力

出力は会話に返す。構成は verdict 1 行、blocker 一覧、advice 一覧、質問の順。blocker と advice が 0 件の節は「なし」と書く。verdict は下表を上から順に判定し、最初に該当したものを採る。次の手は下表の値を既定とし、Phase 2 が種別を見て別の次の手を決めていたなら、そちらで置き換える。

| verdict     | 条件                    | 次の手                                         |
| ----------- | ----------------------- | ---------------------------------------------- |
| needs-plan  | `## Plan` 節が無い      | `/think` で plan を作り `/issue <番号>` で転記 |
| needs-fix   | blocker が 1 件以上ある | blocker を解消してから再度 `/qualify`          |
| build-ready | blocker が 0 件         | build workflow に issue 番号を渡す             |

### 質問

指摘のうち、本文を読むだけでは埋まらないものを質問にする。仕様の空白や判断の未決がこれに当たり、書式の不備は質問にせず修正案をそのまま書く。質問には期待する答えを仮説として添える。読み手は仮説を訂正するだけで答えられる。

質問はユーザーに向けて出す。自分で答えを決めるか issue の著者へ投げるかは、ユーザーが選ぶ。

## ルール

| ルール           | 内容                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| 投稿しない       | GitHub への comment 投稿を行わない。出力は会話に返す                    |
| 1 件ずつ         | 複数 issue の一括 triage は対象外。1 回の起動で 1 issue を検分する      |
| 判定の正は build | preconditions の実在は build の Revalidate が正。ここでの照合は予告     |
| 優先度を決めない | priority ラベルの有無だけを見る。値の当否は判定しない                   |
| 条件を写さない   | build が止まる条件は build.js を実行時に読む。この skill に書き写さない |
