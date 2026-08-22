---
name: qualify
description: issue が build に投入できる形かを検分し、verdict (build-ready / needs-plan / needs-fix / needs-split) と指摘を返す。起票には使わない (/issue)。PR と plan の突合には使わない (/preview)。
when_to_use: 実装可否, build-ready 判定, issue 品質チェック, qualify issue, check issue before build
allowed-tools: Bash(gh issue view:*) Bash(gh repo view:*) Bash(ugrep:*) Bash(bfs:*) Read AskUserQuestion
model: opus
argument-hint: "[issue number or URL]"
---

# /qualify - issue の build 投入可否を検分

build へ渡す前に issue を検分し、投入して進むか、先に手を入れるかを返す。build が Load 段で止まる条件は build.js が持つので、実行時にそこから読む。判断が要る指摘は仮説付きの質問にしてユーザーへ返す。

## 入力

`$ARGUMENTS` は issue 番号か URL。空なら AskUserQuestion で対象を尋ねる。

## Phase 1: 取得

`gh issue view <ref> --json number,title,body,labels,url` で本文とラベルを取る。取得に失敗したら ref を報告して停止する。`gh repo view --json nameWithOwner` で手元のリポジトリを取り、url の owner/repo と突き合わせる。

## Phase 2: Plan 契約の検分

`## Plan` 節が無ければ verdict を needs-plan にして、Phase 3 の軸のうち AC の検証可能性だけを見てから Phase 4 へ進む。plan の無い issue には contract が無いため、新規作成の衝突と表示フィールドの列挙は判定する材料を持たない。残りの軸は advice なので、次の手を変えない。AC が検証不能なまま `/think` へ送ると、その AC へ向けて plan を設計することになる。

needs-plan では着手の判断が変わらない一方、次の手は issue の内容で変わる。AC が検証不能なら、次の手を「AC を検証可能に書き直してから plan を書く」にする。title が `[Bug]` で本文に原因の言明が無ければ、次の手を「原因を特定してから plan を書く」にする。どちらにも当たるときは両方を書き、どちらにも当たらなければ次の手は「plan を書く」のままになる。

Plan 節があるときは、build.js の判定条件を実行時に読んで適用し、違反した項目をすべて blocker として扱う。build が同じ条件で止まるため、重大度は blocker のままにする。条件を読めないまま検分を続けると、違反が無い状態と条件を当てていない状態を出力が区別できない。

1. ugrep で ${CLAUDE_SKILL_DIR}/../../workflows/build.js を探し、`const validate = |const UNIT_CAPS = |const oversizedUnits = ` に一致する行の位置を特定する。いずれかがヒットしなければ、読めなかったアンカーを報告して停止する
2. Read でヒットした箇所を読む
3. issue 本文の Plan 節を読んだ条件に当てて、違反を列挙する

### id クロスチェック

build は本文の U-NNN と T-NNN の id 集合を抽出結果と厳密比較する。qualify の検分は本文だけを対象とするので、本文側の id が一意かを見る。id は `### U-NNN` で始まる行と、リストマーカー直後の `T-NNN` から集める。重複は blocker。欠番は build が止まる条件に無いので、検分しない。

## Phase 3: 形式と前提の検分

issue の書式が `/issue` の出力形式に沿うか、plan の前提が現在のコードと噛み合うかを見る。検査する軸は次の表のものに限る。AC が検証不能なら、実装した結果が正しいかを誰も判定できず、build の conformance も照合先を失う。「エラーがスクリーンリーダーに通知される」は通り、「UX が改善される」は通らない。新規作成先に既存ファイルがあると、build のどの段もそれを見ないまま上書きへ進む。preconditions の実在は build の Revalidate が正なので、ここでの照合は build で止まる可能性の予告として advice に置く。

Phase 1 の突き合わせで owner/repo が食い違ったときは、preconditions の実在と新規作成の衝突を検分しない。手元のコードは issue の対象ではないため、当てれば実在するファイルを無いと読み、無いファイルを在ると読む。検分しなかった軸は、その理由とともに advice に置く。

| 軸                   | 通る条件                                                                                                                                                                 | 重大度  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| title の種別         | `[Feature]` / `[Bug]` / `[Docs]` / `[Chore]` のいずれかで始まる                                                                                                          | advice  |
| What & Why           | 誰の何の痛みかと、その根拠が書かれている                                                                                                                                 | advice  |
| AC の検証可能性      | 各項目が観測可能な結果を述べ、達成を外部の観察者が判定できる                                                                                                             | blocker |
| priority ラベル      | `priority:critical` / `high` / `medium` / `low` のいずれかが付く                                                                                                         | advice  |
| preconditions の実在 | 各 {path, pattern} が現在のコードで見つかる                                                                                                                              | advice  |
| 新規作成の衝突       | contract が新規作成と読める files が、まだ存在しない                                                                                                                     | blocker |
| 表示フィールドの列挙 | 表示するドメインフィールドを追加・変更する場合、そのフィールドを列挙している、または agent が読める出典を引いている。欠落時の指摘は AC と plan の T-NNN への列挙先を示す | blocker |
| 分割の要否           | plan の規模が `rules/core/PREFLIGHT.md` の Task Decomposition の閾値に収まる                                                                                             | split   |

### 分割の要否の数え方

重大度 `split` は build を止めない。blocker と advice のどちらの一覧にも載せず、verdict だけを動かす。`## Plan` 節があるときにだけ当て、無ければこの軸を飛ばす。

閾値は PREFLIGHT の Task Decomposition から取り、4 行のうち当てられる 2 行だけを使う。Lines は plan に出どころが無い。Layers は層の名前を決める工程が qualify に無いので、数える対象が定まらない。当てなかった 2 行は理由とともに advice に置く。

`/issue` の分割判定と同じ問いにはならない。あちらは本文生成の前に走るので plan を見ておらず、数えるのは説明から挙げた criteria になる。ここで数えるのは plan の files と unit で、`/issue` が判断した時点には存在しなかった。断られた提案の繰り返しではない。

| 数えるもの | 数え方                                                                                      | 閾値 |
| ---------- | ------------------------------------------------------------------------------------------- | ---- |
| Files      | 全 unit の files を集め、責務で数える。`.ja/` と英語側の対は 1、実装とそれを覆うテストは 1  | ≥5   |
| Features   | 互いに files を共有しない unit の塊の数。seam unit は定義上すべてを跨ぐので、塊には数えない | ≥3   |

## Phase 4: verdict と出力

出力は会話に返す。テキストは verdict 1 行、blocker 一覧、advice 一覧の順に書き、質問はその後に AskUserQuestion で出す。blocker と advice が 0 件の節は「なし」と書く。verdict は下表を上から順に判定し、最初に該当したものを採る。次の手は下表の値を既定とし、Phase 2 が種別を見て別の次の手を決めていたなら、そちらで置き換える。

| verdict     | 条件                     | 次の手                                         |
| ----------- | ------------------------ | ---------------------------------------------- |
| needs-plan  | `## Plan` 節が無い       | `/think` で plan を作り `/issue <番号>` で転記 |
| needs-fix   | blocker が 1 件以上ある  | blocker を解消してから再度 `/qualify`          |
| needs-split | 分割の要否が閾値を超える | `/slice <番号>` で垂直スライスへ分ける         |
| build-ready | blocker が 0 件          | build workflow に issue 番号を渡す             |

### 質問

指摘のうち、本文を読むだけでは埋まらないものを質問にする。仕様の空白や判断の未決がこれに当たる。書式の不備は修正案をそのまま書く形で返す。

1 件の指摘につき 1 問を立て、期待する答えを仮説として先頭の選択肢に置く。選択肢はユーザーが決める行動として書き、qualify が行う操作としては書かない。1 件の指摘の中で選択肢が排他でないときだけ multiSelect にする。判断の要る指摘が 5 件以上あるときは、重大度の高い 4 件を AskUserQuestion に載せ、残りは質問文と仮説をテキストに並べる。

得られた答えは、本文のどこをどう書き換えるかの案にして返す。qualify は本文を書き換えないので、その案が答えを本文へ入れる経路になる。次の手の行にも答えを書き足す。

判断の要る指摘が 0 件のときは AskUserQuestion を呼ばず、質問の節も置かない。needs-plan のときは、AC の検証可能性の指摘だけを質問にする。plan を書くことは決まっているため、それ以外の答えは着手の内容を変えない。

## ルール

| ルール               | 内容                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 結果の宛先           | 検分の結果は会話に返し、GitHub には issue の読み取りだけを行う                                                       |
| 1 件ずつ             | 1 回の起動で 1 issue を検分する                                                                                      |
| verdict は本文が正   | verdict は取得した時点の issue 本文から決める。質問に答えが付いた後も verdict は同じ値のまま、答えを次の手に書き足す |
| 判定の正は build     | preconditions の実在は build の Revalidate が正。ここでの照合は予告                                                  |
| 優先度は有無だけ     | priority ラベルが付いているかだけを見る                                                                              |
| 条件は build.js が正 | build が止まる条件は build.js を実行時に読む。条件の記述は build.js にだけ置く                                       |
