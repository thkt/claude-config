---
globs: []
scenes: ["pr-create"]
---

# 実 run で観測できるまで PR を draft に据え置く

## 内容

機構を変える PR は、実際に走らせて挙動を見るまで draft のままにする。テストが緑でも、その機構が本番の起動経路で意図どおり動いたことにはならない。draft を外すのは実 run の観測が済んだ後にする。

## 定型手順

1. 実装とテストが揃った時点で draft PR を作る
2. PR 本文に「未実施の受け入れ確認」として、何を実行すれば観測できるかを書く
3. その手順を実行し、観測できた結果を PR へ書く
4. 観測が済んでから draft を外す

## 参照コード

- `skills/pr/SKILL.md` の `Creation Constraints`（`gh pr create --draft` で作る理由。人が本文を読んでから ready にする）

## 根拠

- #226 build を unit ごとのコミットへ変えた PR。本文に「未実施の受け入れ確認 (draft のまま置いている理由)」として「実 issue に対して build workflow を 1 回起動する」を挙げた
- #143 plan を issue 本文へ移し build を実行ループへ縮小した
- #159 起票 PreToolUse gate と recorder 一式を入れた
- #162 hook 配線を skill frontmatter hooks へ移設した
- #163 issue skill へ consume 用 PostToolUse:Bash recorder を追加した
