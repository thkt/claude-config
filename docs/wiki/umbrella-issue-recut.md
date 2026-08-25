---
globs: []
---

# 計画 issue は実装 issue へ切り直して close する

## 内容

「検討する」「設計する」で起票した issue は、検討が終わった時点で実装 issue へ切り直し、元の issue は切り直し先を名指して close する。計画のまま残すと、着手可能かどうかが一覧から読めなくなる。

## 定型手順

1. 検討が終わったら、実装できる単位で新しい issue を起票する
2. 元の issue の close コメントに、切り直し先の issue 番号を書く
3. 元の issue を close する

## 参照コード

- `skills/issue/SKILL.md` の `Split assessment`（epic と子 issue へ分ける判断。着手できない子を作らない条件を持つ）

## 根拠

- #37 Stop hook の Knowledge Reflection 自動化。検討 issue として起票し close した
- #42 サイレント完了検出。close コメントに「gates#17 で実装 issue として切り直しました」と書いた
- #46 yomu search による既存実装コンテキスト自動注入
- #136 workflow scripts の agent() 例外封じ込めと fail-close の共通化
