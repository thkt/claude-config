---
globs: ["**/.claude-plugin/marketplace.json"]
scenes: ["pr-create"]
---

# plugin の version bump は fix と別の PR にする

## 内容

plugin の配布は fix PR がマージされた後、`marketplace.json` の version bump を別 PR で行う。桁は fix なら patch、呼び出し契約の変更なら minor を上げる。同じ PR に混ぜると、fix のレビューと配布の判断が 1 回のマージ判断に潰れる。

## 定型手順

1. fix の PR を作り、マージする
2. `marketplace.json` の version を上げる PR を別に作る
3. 桁は fix なら patch、呼び出し契約が変わったなら minor

## 参照コード

- `.claude-plugin/marketplace.json`（version を持つ配布の定義）

## 根拠

- #200 plugin の配布で version bump の扱いが問題になった
- #203 fix と bump を分ける形に落ち着いた
- #207 桁の上げ方を fix=patch / 契約変更=minor と決めた
