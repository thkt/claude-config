---
name: use-workflow-pageshot
description: Internal helper for /pr. Reads PR body (Preview URL + How to Test), drives agent-browser to capture a screenshot (1 step) or a video (2+ steps), and returns the artifact path for manual attachment on GitHub web UI.
when_to_use: /pr workflow UI変更検出時のスクショ/動画撮影, screenshot capture, video capture
allowed-tools: Read Bash(agent-browser:*) Bash(ffmpeg:*) Bash(mkdir:*) Bash(date:*)
model: opus
user-invocable: false
---

# use-workflow-pageshot - PR Screenshot/Video Helper

## Input

| Field       | Source                                                      |
| ----------- | ----------------------------------------------------------- |
| Preview URL | The leading `Preview URL: <URL>` line in the PR body        |
| Steps       | Numbered list under the `## How to Test` section in PR body |

PR body is passed as a string from `/pr`. If Preview URL or How to Test is missing, return `mode: failed` with the missing field name and let `/pr` decide.

## Browser engine

Pass `--session pageshot --engine chrome` on every agent-browser call. The default lightpanda has no graphics rendering engine, so screenshot returns a placeholder PNG with exit 0 and record runs under the same rendering limit. The engine is resolved per command and is not retained on the session, so a single call missing the flag restarts the browser on lightpanda and loses the page state built up so far. `--session pageshot` isolates this from the default session and leaves work already running on lightpanda intact.

## Mode Selection

| Steps count | Mode       | Artifact    |
| ----------- | ---------- | ----------- |
| 1           | screenshot | step-01.png |
| 2+          | video      | capture.mp4 |

## Execution

| Step | Action                                                                                        |
| ---- | --------------------------------------------------------------------------------------------- |
| 1    | Create output directory: ${CLAUDE_SKILL_DIR}/../../workspace/pageshot/$(date +%Y%m%d-%H%M%S)/ |
| 2    | `agent-browser open {Preview URL}`                                                            |
| 3    | Run Screenshot Flow or Video Flow based on Mode                                               |
| 4    | Print absolute path of artifact to stdout                                                     |

## Screenshot Flow (1 step)

| #   | Command                                                                    |
| --- | -------------------------------------------------------------------------- |
| 1   | `agent-browser snapshot` to obtain accessibility tree                      |
| 2   | If the step contains operations, run `agent-browser {click/type/fill/...}` |
| 3   | `agent-browser screenshot --full {outdir}/step-01.png`                     |

## Video Flow (2+ steps)

| #   | Command                                                                |
| --- | ---------------------------------------------------------------------- |
| 1   | `agent-browser record start {outdir}/capture.webm`                     |
| 2   | For each step run `snapshot` then the operation in order               |
| 3   | `agent-browser record stop`                                            |
| 4   | `ffmpeg -i {outdir}/capture.webm -vcodec libx264 {outdir}/capture.mp4` |

Insert `agent-browser wait 500` between steps. Run `snapshot` before each operation to identify elements.

## Output

Single stdout line.

```
mode=screenshot artifact=/absolute/path/to/step-01.png
```

or

```
mode=video artifact=/absolute/path/to/capture.mp4
```

On failure.

```
mode=failed reason=<one-line reason>
```
