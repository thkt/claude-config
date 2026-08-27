---
globs: []
scenes: ["issue-close"]
---

# 前提が消えた issue は not planned で閉じ、消えた前提を残す

## 内容

harness や upstream の更新で issue の前提そのものが無くなることがある。実装しないまま閉じるが、`not planned` を選び、どの前提がどう消えたかを close コメントに書く。理由が無いと、同じ提案が同じ前提で再び起票される。

## 定型手順

1. issue の前提が現在も成り立つかを確かめる
2. 消えていれば、何がその前提を無効にしたかを 1 行で書く
3. `not planned` を理由に選んで close する
4. その issue に依存していた別の issue があれば、依存の撤回もそちらへ書く

## 参照コード

- `skills/issue/SKILL.md` の `Split assessment`（着手できない issue を作らない判断）

## 根拠

- #136 workflow scripts の agent() 例外封じ込めと観測性の共通化
- #184 同じ範囲の feature issue。`NOT_PLANNED` で close された
- #210 「旧本文の #184 依存は前提消滅 (harness が agent() を throw させず retry 後 null を返す設計) のため撤回」と本文に残した
