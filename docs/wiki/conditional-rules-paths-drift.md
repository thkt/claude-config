---
globs: ["**/rules/**"]
---

# rules の paths が発火しないまま実装が先行する

## 内容

`paths:` frontmatter を持つ rules は、その glob に当たるファイルを触ったときだけ読まれる。glob が実際のパスに当たっていないと、規約は書かれているのに一度も届かず、実装だけが先へ進んで乖離する。書いた後に発火することを確かめる。

## 定型手順

1. `paths:` を書いたら、その glob に当たる実ファイルを 1 つ挙げる
2. そのファイルを触る作業で規約が読まれるかを確かめる
3. 当たらないときは repo root 直下の形も足す。起動元によって相対の起点が変わる

## 参照コード

- `rules/conventions/MARKDOWN.md` の `paths:`（複数の起点を並べた例）
- `skills/scribe/scripts/find_wiki_rule.py` の `glob_to_regexp`（wiki 側で同じ照合をする実装）

## 根拠

- #237 条件付き rules の `paths` へ repo root 直下形を足した
- #240 発火していなかった 3 つの規約ファイルと実態の乖離を解消した
