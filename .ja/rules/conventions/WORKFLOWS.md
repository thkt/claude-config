---
paths:
  - ".claude/workflows/**"
  - "workflows/**"
  - ".ja/workflows/**"
---

# Workflow Conventions

`workflows/` 配下の workflow script (headless で決定論的に走る pipeline) に対する規約。

## 命名とファイル配置

discovery は `workflows/` 直下を flat に読み、`.js` だけを workflow として登録する。

| 対象                | 規則                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------- |
| script のファイル名 | `workflows/<name>.js`。`<name>` がそのまま `Workflow({name})` で解決される名前                |
| name の形           | 英単語 1 語。helper, utils, tools のような汎用名は使わない                                    |
| 補助 script         | `workflows/<name>/` へ置く。直下へ `.js` を置くと、補助のつもりでも workflow として登録される |
| 共有ハーネス        | `workflows/_lib/` へ置く。テストから import する用途に限る                                    |

script 本体に行数の上限は無い。skill と subagent の 200 行はそのまま当たらない。script 内の prompt 文字列は LLM が読むので、そちらは PROSE.md の文長規約に従う。

## 参照記法

同梱資材を指すパスは、dev tree (`~/.claude`) と plugin 配布 (`~/.claude/plugins/` 配下) の両方で解決する形で書く。plugin として配布された環境では、dev tree のパスに実体が無い。

| 参照する対象                                                | 書き方                                    | 理由                                                           |
| ----------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| 同梱の script、template                                     | `bundled(rel)` を script 内で定義して使う | dev tree を先に試し、無ければ plugins 配下を find で拾う       |
| 実行環境側のファイル (`settings.json`、出力先の `history/`) | `$HOME/.claude/<path>` を直書き           | 配布物ではないので、plugin 配布下でも同じパスに実体がある      |
| 別モジュール                                                | 読み込めない                              | script が 1 つの関数本体として評価され `import` を書けないため |

`bundled` の探索は `.ja/` を除外する。plugin の配布物には `.ja/` 側も入っている。探索順は英語側が最後に来ることを保証しないので、除外しないと日本語版の資材を実行してしまう。

`bundled` の定義は script ごとに複製される。定義を変えるときは、その定義を持つ script すべてを同じコミットで変える。

## 引数と prompt の受け取り

script は `args` を文字列とオブジェクトの両方で受ける。文字列は短縮記法で、何を指すかは script ごとに決める。

| 対象                 | 規約                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| args の解釈          | オブジェクトはそのまま使う。文字列は `{` で始まるときだけ JSON として読み、失敗したら短縮記法として扱う                                                                                                |
| 文字列オプション     | `typeof` で型を確かめ、`trim()` が空なら既定値へ倒す。diff の比較対象を指す `base` の既定値は `main`                                                                                                   |
| repo を受ける script | `anchor(p)` を定義し、agent へ渡す prompt をすべて通す。anchor は `cd <repo> &&` を促す 1 文を先頭へ足す |

repo が任意の script は、repo が空なら prompt をそのまま返す。repo が必須の script は常に足す。

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

workflow script は注入引数を持つ 1 つの関数本体として評価される。そのため script 本体に `import` 文を書けず、`workflows/` 配下のどの script にも import の実例が無い。共通ロジックを別モジュールへ切り出す設計は採れないため、重複を見つけても script をまたいで括り出す前にこの制約を確かめる。dynamic `import()` が動くかは未実測で、切り出しが必要になった時点で最小の workflow を 1 つ走らせて確かめる。

テストは通常の ES module として実行されるので、この制約が掛かるのは script 本体だけ。`workflows/_lib/run-workflow.js` のようにテストから import する共有ハーネスは置ける。テスト側は `vm.compileFunction` に `parsingContext` を渡して本番と同じグローバル集合を再現する。

script が読めるグローバルは注入引数 `agent`/`workflow`/`parallel`/`pipeline`/`phase`/`log`/`args` と、本番が別途供給する `budget`/`console`/`setTimeout`/`clearTimeout` に限られる。`crypto`/`fetch`/`process`/`Buffer`/`require`/`structuredClone`/`TextEncoder`/`URL`/`queueMicrotask` は存在せず、参照すると `ReferenceError` になる。`Date.now()`、`Math.random()`、引数なし `new Date()` は resume を理由に挙げる Error に差し替わり、引数つき `new Date()` と `Math.floor` は影響を受けない。文字列からのコード生成 (`eval`、`new Function`) も無効で `EvalError` になる。ハーネスは本番が別途供給する 4 つとも注入する。`budget` は target 未設定の実行と同じ状態 (`total` が null、`spent()` が 0、`remaining()` が Infinity) を返し、`console` の出力は `log()` と同じ logs へ届く。供給する名前は `workflows/_lib/run-workflow.js` の `PRODUCTION_GLOBALS` にあり、名前を足しても注入は増えないので、供給を書き足すまでテストが赤くなる。

## script の解決タイミング

`Workflow({name: "..."})` はセッション開始時点の script を実行する。同じセッションで `workflows/<name>.js` を編集しても、name で呼ぶ限り編集前の版が走る。編集後の版を走らせるには `Workflow({scriptPath: "<絶対パス>"})` を渡す。

そのため、直した workflow を name で確かめると直っていない結果が返り、返り値の形を変えない修正では古い版が走った手がかりも残らない。

ただし scriptPath が効くのは最上位の呼び出しに限る。script 内の入れ子呼び出し (`build.js` が code を呼ぶ形) は名前で解決するため、`code.js` を直して build 越しに確かめると、やはりセッション開始時点の `code.js` が走る。入れ子側で scriptPath を渡す形も `CLAUDE_WORKFLOW_NAME_ONLY` が立つセッションでは拒否される。入れ子で走る script を直したときは、その script を最上位から scriptPath で直接走らせて確かめる。
