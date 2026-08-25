---
globs: ["**/hooks/**/*", "**/agents/**/*", "**/settings.json"]
---

# hook と agent の定義変更は次の session で検証する

## 内容

`settings.json` の hook 登録と agent 定義は session start に読まれ、その session の間は固定される。配線した同じ session でいくら試しても新しい定義は効かない。issue や PR に「次の session で確認する」と書き、その session では判定側を直接叩いて確かめる。

## 定型手順

1. hook を書いたら、本体を標準入力へ payload を渡して直接実行し、判定と出力を確かめる
2. 配線 (`settings.json` への登録) を済ませる
3. issue の Manual verification に「次の session で確認する」と書く
4. session を再起動してから、実際の契機となる操作を打つ

## 参照コード

- `settings.json` の `hooks`（session start に読まれる登録）
- `hooks/post-bash/scribe_prompt.py`（標準入力に payload を渡せば単体で動く形）

## 根拠

- #162 hook 配線を skill frontmatter hooks へ移設した
- #163 issue skill へ consume 用 PostToolUse:Bash recorder を追加した
- #209 session-start snapshot のため同一 session で検証できないことが分かった
- #505 hook を配線した同じ session で 5 回試しても発火しなかった
- #521 settings.json を追跡下へ置いた
