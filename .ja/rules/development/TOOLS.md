# Tool Preferences

CLI ツール > 組み込み相当。WebFetch と WebSearch は、URL パターンに一致した CLI へフックが振り替える。

## コード検索

2 つの skill が構文解析を持ち、2 つの Bash ツールが文字列を持つ。形を問う質問に `ugrep` を使うと、同じ綴りの行だけが返り、書き方の違う行が漏れる。文字列検索に `use-cli-ast-grep` を使うと、リテラル一致で足りるものを構文解析して探すことになる。

| タスク                               | 使う                      | 適用条件                                 |
| ------------------------------------ | ------------------------- | ---------------------------------------- |
| AST の形での一致と一括書き換え       | `use-cli-ast-grep` skill  | ast-grep が構文解析する言語              |
| シンボルの呼び出し元、呼び出し先、影響範囲 | `use-cli-codegraph` skill | codegraph が索引する言語             |
| リテラル文字列または正規表現の内容検索 | `ugrep` (Bash)            | 任意の言語、および解析器が届かないファイル |
| 名前によるファイルとディレクトリの探索 | `bfs` (Bash)              | 任意のツリー                             |
| 過去セッション検索                   | `use-cli-recall` skill    | 任意の言語                               |

## 並列実行

モジュール初接触または BACKLOG タスク開始時、`use-cli-codegraph` と `use-cli-recall` を並列実行する。詳細は各 skill にある。

## frontmatter を持たない理由

`rules/` のファイルは `paths:` frontmatter に対象ファイルの glob を宣言し、そのファイルを編集する時にだけ読み込まれる (rules/conventions/SKILLS.md など)。本ファイルが扱うのは検索を始める前にどの検索ツールを選ぶかという判断であり、判断の時点で検索対象のファイルはまだ決まっていない。決定を絞り込む glob が存在しないため、`paths:` frontmatter を持たない。形は同じく frontmatter を持たない `rules/conventions/PROSE.md` に倣う。
