---
globs: ["**/hooks/**"]
---

# PostToolUse:Agent は launch 時にしか発火しない

## 内容

`PostToolUse` の `Agent` matcher は subagent の起動時に 1 度発火するだけで、非同期の完了時に 2 度目は来ない。完了を待つ gate をこの hook で組もうとしても成立しない。完了に依存する判定は hook でなく、呼び出し側の workflow か skill が持つ。

## 定型手順

1. hook で捉えたいものが起動なのか完了なのかを先に分ける
2. 完了なら hook を使わず、呼び出し側で結果を受け取ってから判定する
3. 起動時に足りる判定だけを hook へ残す

## 参照コード

- `settings.json` の `hooks.PostToolUse`（matcher ごとの登録）

## 根拠

- #150 issue 品質ゲートを skill ベースへ再設計する epic
- #154 issue-gate hook を PreToolUse gate と recorder の 2 本で組んだ
- #160 gate script のパス修正と false-positive deny の解消
