# Tool Preferences

CLI ツール > 組み込み相当。WebFetch/WebSearch は URL パターンに基づいてフックで適切な CLI にルーティングされる。

## コード検索

| タスク                              | 使う                   | 適用条件                      |
| ----------------------------------- | ---------------------- | ----------------------------- |
| 概念 / 識別子 / 関連コード          | `use-cli-yomu` skill   | TS/JSX/CSS/HTML/Rust/Markdown |
| 概念 / 関連コード                   | `ugrep` / `bfs` (Bash) | Swift / Python / Go / その他  |
| リテラル正規表現 / 既知の正確なパス | `ugrep` / `bfs` (Bash) | 任意の言語                    |
| 過去セッション検索                  | `use-cli-recall` skill | 任意の言語                    |

## 並列実行

モジュール初接触または BACKLOG タスク開始時、`use-cli-yomu` と `use-cli-recall` を並列実行する。詳細は各 skill にある。

## frontmatter を持たない理由

rules/ のファイルは `paths:` frontmatter に対象ファイルの glob を宣言し、そのファイルを編集する時にだけ読み込まれる (rules/conventions/SKILLS.md など)。本ファイルが扱うのは検索を始める前にどの検索ツールを選ぶかという判断であり、判断の時点で検索対象のファイルはまだ決まっていない。決定を絞り込む glob が存在しないため、`paths:` frontmatter を持たない。形は同じく frontmatter を持たない `rules/conventions/PROSE.md` に倣う。
