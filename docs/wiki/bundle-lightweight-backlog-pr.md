---
globs: []
scenes: ["pr-create"]
---

# 軽量バックログ複数件は 1 PR に束ねて複数 Closes する

## 内容

実装規模が小さく互いに独立した backlog issue が複数溜まったら、個別 PR に分けず 1 PR にまとめ、対象 issue の数だけ `Closes #N` を列挙して閉じる。1 件ずつ PR を分けると、レビュー往復のオーバーヘッドが実装コストを上回る。

## 定型手順

1. 溜まっている backlog issue のうち、実装規模が小さく互いに独立したものを列挙する
2. 1 PR にまとめ、本文で issue ごとに変更内容を分けて書く
3. 対象 issue の数だけ `Closes #N` を列挙する
4. 個別の commit や PR 分割を要する規模のものは対象から外す

## 根拠

- #44 SECURITY.md / PITFALLS.md のルール追記と pu.sh 教訓 memory 追加の 3 件を 1 PR にまとめ、`Closes #11` `Closes #12` で閉じた
- #45 skill/template への 4 ルール追記 (#30 #31 #32 #34) を 1 PR にまとめ、4 件の `Closes` を列挙した
