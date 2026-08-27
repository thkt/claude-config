---
globs: []
scenes: ["issue-close"]
---

# 成果物が追跡外にある作業は手動 close する

## 内容

成果物が `git` の追跡外へ出る作業は、PR を作らずに issue を手動で close する。`output-styles/` と `.claude/workspace/` 配下の生成物、およびリポジトリの外で公開する記事がこれに当たる。PR を作っても差分が空になるため、close コメントに成果物の所在を書く。

## 定型手順

1. 成果物の置き場が追跡下かを `git ls-files <パス>` で確かめる
2. 出力が空なら追跡外なので、PR を作らずに進める
3. 作業が終わったら issue へ成果物の所在を書き、手動で close する

## 参照コード

- `.gitignore` の `workspace/` 行（workspace 配下が追跡外である根拠）

## 由来

- `docs/decisions/0090-unify-workspace-and-history-storage-locations.md`（workspace と history の置き場を統一した DR）

## 根拠

- #33 caveman 圧縮モードを `output-styles/` へ追加した
- #37 Stop hook の cache-safe 設計。close コメントに「design doc 作成完了: `workspace/research/...` (workspace/ 配下、git ignore のためローカルのみ)」と書いて手動 close した
- #38 Zenn 記事化。成果物がリポジトリ外
- #42 サイレント完了検出の検討
