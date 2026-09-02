# Finding Disposition and Calibration

読んだ人間が finding に対して何をするか、そしてどの finding をそもそも報告するか。フィールドの定義は `finding-schema.md` にある。

## Disposition

Severity は影響の大きさを表す。Disposition は読んだ人間が次に何をするかを表す。マージを止めるべきか作者の判断に委ねてよいかは severity が答えない軸なので、2 つを 1 つの finding に並べて載せる。

「併走する severity」は目安であって導出規則ではない。既定値は severity から導かず must に固定する。`workflows/assert.js` の gate は severity を見ず `issues.length > 0` だけで NotReady を出すので、severity 由来の既定値だと blocking な finding へ nits が付く。この語彙は audit 側に閉じ、`/preview` へは戻さない (`skills/preview/tests/plan-alignment.test.js` が禁止している)。

| 値   | 意味                                 | 併走する severity | 供給元                          |
| ---- | ------------------------------------ | ----------------- | ------------------------------- |
| must | マージ前に直す                       | critical / high   | script の既定値、または 3 本    |
| want | 直さない理由が無ければ直す           | medium            | 下記 3 本の reviewer            |
| imo  | 作者が決める                         | low               | 下記 3 本の reviewer            |
| nits | 見た目の指摘。直すかは任意           | low               | 下記 3 本の reviewer            |
| ask  | コードだけでは決まらない。人間に聞く | 対応なし          | critic の needs_context verdict |
| info | 処理済み。記録として残す             | 対応なし          | triage の disputed / downgraded |

| 規則          | 内容                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| 既定値        | must。reviewer が申告しない finding には script が付ける                                                    |
| 申告できる値  | must / want / imo / nits の 4 つ。ask と info は reviewer が出す種類ではない                                |
| 上書きの主体  | reviewer-design / reviewer-readability / reviewer-reuse の 3 本のみ。指摘が作者の好みに寄りうる lens に限る |
| 上書きの条件  | disposition_reason を添える。理由の無い上書きは既定値 must に戻す                                           |
| 統合の順序    | must > want > imo > nits。統合した finding は統合元のうち最も強い値を採る                                   |
| gate との関係 | disposition はいかなる gate の入力にもしない。修正の順序を表す軸であって、マージ可否を表す軸ではない        |

## キャリブレーションフィルタ

順に適用する。いずれかが除外したら報告しない。

| Filter              | 質問                                                             | 除外条件                                   |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| Senior Engineer     | senior engineer なら変更を要請するか                             | "好み次第" または "PR をブロックしない"    |
| Harm                | bug/data loss/security/maintenance burden の具体トリガーがあるか | 挙げられない                               |
| Fix Proportionality | 修正がリスクに見合うか                                           | 低 severity issue に対する大規模リファクタ |

### Context Test

各 reviewer 自身の `## キャリブレーション` 見出しが `calibration/` 配下の REPORT/SKIP 例を指す。迷ったら SKIP を優先。challenger は false negative を捕まえる存在だが、false positive は pipeline capacity を浪費する。

| コンテキスト    | アクション                                                  |
| --------------- | ----------------------------------------------------------- |
| Cold path       | severity >= high でない限り除外                             |
| Intentional     | code comments、エラーメッセージ、命名が意図を示唆 → 除外    |
| Framework idiom | framework/library の慣用に従う → 除外                       |
| Indirect cover  | caller または integration test 経由でテスト済み → 除外 (TC) |
| Semantic differ | 構造は似ているが business logic が異なる → 除外 (DRY)       |

## Memory の用途

critic-design と reviewer-security は frontmatter に `memory` を持ち、agent-memory を下表の線引きで使う。false positive の判定は critic-audit が担い、disputed として record に残る。そのため reviewer は見つけた finding をすべて報告し、過去に報告済みで受理済みのパターンも報告対象に含める。既知であるという事実は severity の判断材料として使う。

| 用途                                           | 可否     |
| ---------------------------------------------- | -------- |
| severity の判断材料 (actor、threat model など) | 使う     |
| 報告前の再チェック手順 (grep、確認コマンド)    | 使う     |
| finding を報告するかどうかの判断               | 使わない |
