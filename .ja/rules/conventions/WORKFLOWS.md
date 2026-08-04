---
paths:
  - ".claude/workflows/**"
  - "workflows/**"
  - ".ja/workflows/**"
---

# Workflow Conventions

`workflows/` 配下の workflow script (headless で決定論的に走る pipeline) に対する規約。

## Degradation の記録

Degradation とは、失敗または欠落した sub-result を、構造化フィールドと `log()` のどちらにも喪失粒度で記録しないまま drop または default する branch を指す。喪失粒度とは、何が/いくつ/なぜ落ちたかを後から再構成できる情報 (件数、id、対象名、理由)。

主チャネルは workflow の返り値。snapshot は audit workflow だけが持つ追加チャネル (DR-0047 の `docs/audit/` への書き出し) で、他 workflow の実装者は返り値へ記録する。`log()` は対話中の補完で、返り値だけでは人間が気づけない degradation を実行ログに残す。喪失粒度を返り値の構造化フィールドへ既に残しているなら `log()` は任意。

記録すべき粒度を状況ごとに示す。

| 状況                                            | 記録すべき粒度                          |
| ----------------------------------------------- | --------------------------------------- |
| agent 応答が schema を満たさず default へ倒れる | 落ちた件数、対象 id、既定値を採った事実 |
| sub-result の一部が欠落し残りで続行             | 全体数に対する取得数、欠落分の識別子    |
| 失敗を握って fail-open で次 phase へ進む        | 検証できなかった対象、未検証である旨    |

## キャリブレーション

`build.js` の translate-tail を良い例、黙った空配列倒しを悪い例として対比する。

| 判定 | branch                                            | 記録                                                        |
| ---- | ------------------------------------------------- | ----------------------------------------------------------- |
| Good | 全 id が揃わず英語原文へ fail-open                | `${byId.size}/${slots.length} translated` を `log()` に出す |
| Bad  | agent 応答を空配列 default へ倒し件数も残さず続行 | 件数も理由も返り値にも `log()` にも残らない                 |

## 記録済みサイトの扱い

既に構造化フィールド (返り値の配列やカウント) で喪失粒度を残しているサイトは対象外。同じ情報を `log()` へ二重に出すことは求めない。

## テストのカバレッジ

現行の degradation サイトはサイトごとに個別テストで守られている。degradation クラス全体 (全 branch が喪失粒度を残すこと) を横断的に保証するテストは無い。新しい drop/default branch を足すときは、そのサイト固有のテストで喪失粒度の記録を検証する。既存テストは新規サイトを自動でガードしない。

## script の評価形式

workflow script は `new AsyncFunction(source)` として評価される。そのため script 本体に `import` 文を書けず、`workflows/` 配下のどの script にも import の実例が無い。共通ロジックを別モジュールへ切り出す設計は採れないため、重複を見つけても script をまたいで括り出す前にこの制約を確かめる。dynamic `import()` が動くかは未実測で、切り出しが必要になった時点で最小の workflow を 1 つ走らせて確かめる。

テストは通常の ES module として実行されるので、この制約が掛かるのは script 本体だけ。`workflows/_lib/run-workflow.js` のようにテストから import する共有ハーネスは置ける。
