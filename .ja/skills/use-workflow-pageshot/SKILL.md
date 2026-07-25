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

| フィールド  | ソース                                                    |
| ----------- | --------------------------------------------------------- |
| Preview URL | PR 本文の冒頭にある `Preview URL: <URL>` 行               |
| Steps       | PR 本文の `## How to Test` セクション配下の番号付きリスト |

PR 本文は `/pr` から文字列として渡される。Preview URL または How to Test が欠落していれば、`mode: failed` と欠落フィールド名を返し、判断は `/pr` に任せる。

## ブラウザ engine

すべての agent-browser 呼び出しに `--session pageshot --engine chrome` を付ける。既定の lightpanda はグラフィックレンダリングエンジンを持たず、screenshot はプレースホルダー PNG を exit 0 で返し、record も同じレンダリング制約を受ける。engine は毎コマンドの解決値で決まりセッションには保持されないため、フラグを落とした呼び出しが 1 つ混ざるだけでブラウザが lightpanda で再起動し、そこまでのページ状態が失われる。`--session pageshot` で既定セッションから隔離し、普段 lightpanda で進めている作業を壊さない。

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

| #   | コマンド                                                               |
| --- | ---------------------------------------------------------------------- |
| 1   | `agent-browser record start {outdir}/capture.webm`                     |
| 2   | 各 step について順に `snapshot` してから操作を実行                     |
| 3   | `agent-browser record stop`                                            |
| 4   | `ffmpeg -i {outdir}/capture.webm -vcodec libx264 {outdir}/capture.mp4` |

step 間に `agent-browser wait 500` を挟む。各操作の前に `snapshot` を実行して要素を特定する。

## 出力

stdout の 1 行。

```
mode=screenshot artifact=/absolute/path/to/step-01.png
```

または

```
mode=video artifact=/absolute/path/to/capture.mp4
```

失敗時。

```
mode=failed reason=<one-line reason>
```
