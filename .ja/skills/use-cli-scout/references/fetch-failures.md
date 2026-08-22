# 取れないページと迂回路

`scout fetch` は本文が取れなくても exit 0 で返る。返った Markdown に次のいずれかが出たらこのファイルを引く。本文が短い。表の区切り行が無い。見出しが本文と混ざる。行番号が合わない。

## 出力が壊れる

`fetch` と `research` が返す Markdown は、コードブロック、表、リストを壊す。コード内でも `< > * \ _ ~` をエスケープし、`<pre><code>` を二重にマークし、表の区切り行を落とす。`--raw` でも `--json` でも同じで、抑止するオプションは無い。原因は `fast_html2md` にあり、htmd への置き換えは thkt/scout#370。

コード内にバッククォートがあると、バックスラッシュを外しても元の文字列へ戻せない。GitLab 経路には `repo-read` が使えないので、`=\>` のようなバックスラッシュは手で外す。wiki は `--raw` を外すと本文の大半が消えるため、`--raw` を必ず付ける。付けてもエスケープは残る。

| 取りたいもの          | 迂回路                                                                              |
| --------------------- | ----------------------------------------------------------------------------------- |
| GitHub 上のファイル   | `scout repo-read <owner/repo> <path>`                                               |
| GitHub の wiki ページ | `scout fetch --raw https://raw.githubusercontent.com/wiki/<owner>/<repo>/<Page>.md` |
| GitLab 上のファイル   | `scout fetch https://gitlab.com/<owner>/<repo>/-/raw/<ref>/<path>`                  |

## サイト別に本文が返らない

`agent-browser read` の出力が `Loading` で終わったら、`read` をもう一度実行する。先頭には cookie 同意ダイアログとナビゲーションが並ぶので、`#` で始まる見出しから読む。zenn の book は本文が落ちた回も stderr が成功を出すので、判別できるのは出力の行数だけ。落ちた回は章がそこで終わっているように読めるため、落ちたこと自体に気付かない。存在しない章 URL は exit 66 で返るので、`2>/dev/null` を付けるとレンダリング失敗と見分けが付かなくなる。

| サイト                     | 症状                                                                          | 迂回路                                   |
| -------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| crates.io のクレートページ | `--js` 付きでも status 404                                                    | `https://docs.rs/crate/<name>/latest`    |
| builder.aws.com            | sandbox 内は SSRF proxy が起動せず raw fallback へ落ち、title の 1 行だけ返る | `agent-browser open <URL>` のあと `read` |
| zenn.dev の book の viewer | 同じ URL で本文が出る回と出ない回が混ざる                                     | 本文が出るまで引き直す                   |

## 行番号と見出しがずれる

`repo-read` の出力は `cat -n` 形式で行番号を埋め込むので、grep したら grep の番号でなく行内の番号を読む。docs.rs でも API ドキュメント側 (`docs.rs/<name>/latest/...`) に行番号リンクは出ない。見出しの分離はアンカー付き見出し一般の挙動ではなく、同じくアンカーを持つ MDN は 1 行に収める。

| 対象                        | ずれ方                                     | 対処                           |
| --------------------------- | ------------------------------------------ | ------------------------------ |
| docs.rs のソースビューア    | 本文の前に全行分の行番号リンクが並ぶ       | GitHub 側を `repo-read` で読む |
| zenn.dev の記事とスクラップ | 見出しマーカーと見出し文字列が別の行に出る | マーカー行の次の行を読む       |

## scout の守備範囲外

`repo-*` は GitHub API の `/repos/<owner>/<repo>` へ解決するので、GitLab のリポジトリと GitHub の wiki には `error: Not found` を返す。

x.com には scout のルーティングが無く `fetch` へ流れるので、read-only の X CLI である `xr` で読む。

`xr article` は Article でない投稿を exit 2 で返すので、出力を読む前に exit code で分ける。`xr tweet --thread` の出力は先頭が要求した投稿とは限らず、無関係なタイムライン投稿と同日の返信が混ざる。`id` か `url` が要求と一致する要素を起点に、起点と同じ author の要素を全体から拾い、`time` の連続は条件にしない。`--thread` は画像 URL と引用元の投稿を落とし、落ちたことを示すフィールドも出さない。`text` が `t.co` リンクで終わる投稿と、指示語の指す先が `text` に無い投稿は `--thread` 無しで引き直す。

| 入力                 | コマンド                  |
| -------------------- | ------------------------- |
| Twitter Article      | `xr article <URL>`        |
| 通常の投稿とスレッド | `xr tweet <URL> --thread` |

## 引数の形

`repo-tree` はパスを位置引数で受けない。`scout repo-tree <owner/repo> plugins/html` は `error: unexpected argument` で落ち、`repo-list` を打ったときに出るような似たサブコマンドの誘導も出ない。絞り込みは `-p/--path` と `--pattern` で行う。
