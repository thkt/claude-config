---
globs: []
scenes: []
---

# 横展開の要否を ugrep 全ツリー確認で確定する

## 内容

1 箇所で見つけた不具合や規約違反は、直す前に全ツリーを検索して同じ形が他にいくつあるかを数える。数えてから scope を固定する。1 箇所だけ直すと、同じ原因の残りが後から別の issue として戻ってくる。

## 定型手順

1. 見つけた形を表す検索語を決める。語の揺れを含めた正規表現にする
2. `ugrep` で `.ja/` を含む全ツリーを検索し、ヒットを列挙する
3. ヒットのうち同じ原因のものを数え、scope に入れるか別 issue にするかを決める
4. 決めた scope を issue へ書く。数えた件数も書く

## 参照コード

- `docs/wiki/path-reference-audit.md`（パス参照の棚卸しで、形式ごとに展開規則を変える手順）

## 根拠

- #49 explore skill の WAL DB クエリ失敗を修正した
- #50 critic-design の weakness 出力へ supporting / disconfirming probe 列を追加した
- #53 audit-adr-gaps の report slug と title を skill 名へ揃えた
- #57 ADR-0025 の /goal 移行を ja mirror へ反映し、ralph-loop の drift を解消した
