---
name: use-workflow-pageshot
description: /pr の内部ヘルパー。PR 本文 (Preview URL + How to Test) を読み取り、agent-browser を駆動してスクリーンショット (1 step) または動画 (2+ step) を撮影し、GitHub web UI への手動添付用に成果物のパスを返す。
when_to_use: /pr workflow UI変更検出時のスクショ/動画撮影, screenshot capture, video capture
allowed-tools: Read Bash(agent-browser:*) Bash(ffmpeg:*) Bash(mkdir:*) Bash(date:*)
model: opus
user-invocable: false
---

# use-workflow-pageshot - PR スクリーンショット/動画ヘルパー

## 入力

PR 本文は `/pr` から文字列として渡される。下表のいずれかが欠落していれば、`mode: failed` と欠落フィールド名を返し、判断は `/pr` に任せる。

| フィールド  | ソース                                                    |
| ----------- | --------------------------------------------------------- |
| Preview URL | PR 本文の冒頭にある `Preview URL: <URL>` 行               |
| Steps       | PR 本文の `## How to Test` セクション配下の番号付きリスト |

## ブラウザ engine

すべての agent-browser 呼び出しに `--session pageshot --engine chrome` を付ける。既定の lightpanda は screenshot でプレースホルダー PNG を返す。

## モード選択

| Steps の数 | モード     | 成果物      |
| ---------- | ---------- | ----------- |
| 1          | screenshot | step-01.png |
| 2+         | video      | capture.mp4 |

## 実行

| ステップ | アクション                                                                                   |
| -------- | -------------------------------------------------------------------------------------------- |
| 1        | 出力ディレクトリを作成。${CLAUDE_SKILL_DIR}/../../workspace/pageshot/$(date +%Y%m%d-%H%M%S)/ |
| 2        | `agent-browser open {Preview URL}`                                                           |
| 3        | モードに応じて Screenshot Flow または Video Flow を実行                                      |
| 4        | 成果物の絶対パスを stdout に出力                                                             |

## Screenshot Flow (1 step)

| #   | コマンド                                                                 |
| --- | ------------------------------------------------------------------------ |
| 1   | `agent-browser snapshot` でアクセシビリティツリーを取得                  |
| 2   | step に操作が含まれていれば `agent-browser {click/type/fill/...}` を実行 |
| 3   | `agent-browser screenshot --full {outdir}/step-01.png`                   |

## Video Flow (2+ steps)

step 間に `agent-browser wait 500` を挟む。各操作の前に `snapshot` を実行して要素を特定する。

| #   | コマンド                                                               |
| --- | ---------------------------------------------------------------------- |
| 1   | `agent-browser record start {outdir}/capture.webm`                     |
| 2   | 各 step について順に `snapshot` してから操作を実行                     |
| 3   | `agent-browser record stop`                                            |
| 4   | `ffmpeg -i {outdir}/capture.webm -vcodec libx264 {outdir}/capture.mp4` |

## 出力

stdout の 1 行。

```text
mode=screenshot artifact=/absolute/path/to/step-01.png
```

動画を撮ったとき。

```text
mode=video artifact=/absolute/path/to/capture.mp4
```

失敗時。

```text
mode=failed reason=<one-line reason>
```
