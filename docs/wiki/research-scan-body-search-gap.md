---
globs: ["**/skills/research/scripts/find-prior-research.py"]
scenes: []
---

# 過去調査のスキャンはファイル名一致だけでは本文の関連を取りこぼす

## 内容

過去の research ファイルを探すとき、ファイル名の slug 一致だけに頼ると、ファイル名は違うが本文が関連する報告を取りこぼす。ファイル名検索に加えて本文検索も行う。

## 定型手順

1. slug のファイル名一致で過去調査を検索する
2. 同時に本文検索(grep 等)でも同じ主題を検索する
3. 両者の結果件数が大きく異なるときは、ファイル名一致だけでは足りないと判断し、本文検索側の結果も見る

## 参照コード

- `skills/research/scripts/find-prior-research.py` の `main`(ファイル名 slug の語重なりだけで過去調査を探す実装。本文検索を持たない)

## 根拠

- (research) hyperresearch port candidates 調査で、slug `research-skill-improvement` でのファイル名検索は 0 件だったが、同じ意図の本文検索 `ugrep '/research'` は 7 件ヒットし、0 対 7 の差を優先度の根拠にした
- (research) build/ship のスコープ逸脱調査で、issue slug 生成に語数や選定規則が無く、"stage" を含む slug が無関係ファイルと誤って一致しうる形を指摘した
