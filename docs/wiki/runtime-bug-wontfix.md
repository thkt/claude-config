---
globs: []
---

# runtime 側のバグは wontfix + upstream 起票 + guard 文言で閉じる

## 内容

根本原因が Claude Code 本体にあるとき、リポジトリ側では直せない。wontfix として close し、upstream へ起票し、こちら側では踏んだときに気づける guard 文言を残す。3 つを揃えないと、直らない issue が open のまま残るか、次に踏んだ人が同じ調査をやり直す。

## 定型手順

1. 原因が本体側にあることを、再現の最小形で確かめる
2. upstream へ起票する
3. こちら側の guard へ、踏んだときに読む文言を足す
4. issue を wontfix で close し、upstream の参照と guard の位置を close コメントに書く

## 参照コード

- `workflows/build.js` の `stopped` 分岐（`why` に呼び出し側が次に取る操作を書く形）

## 根拠

- #132 build.js の resume が args を運ばず no-task guard が誤発火した
- #133 build.js の resume が orphan started marker を残し phase 完了判定を汚した
- #177 resume で args 再指定が必須であることを guard の `why` に明記した
