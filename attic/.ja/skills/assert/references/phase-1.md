# Phase 1: Evidence Collection (並列)

Task (background) で 3 つを並列に起動する。すべて完了したら Phase 2 に進む。codex を background Bash で起動した場合、出力は harness が割り当てた output-file をそのまま読む (`$TMPDIR` へ再リダイレクトしない)。

| Task            | 実行者             | アクション                                                          |
| --------------- | ------------------ | ------------------------------------------------------------------- |
| Codex review    | Codex CLI (Bash)   | 変更 / 対象コードの静的レビュー                                     |
| Audit reviewers | Claude Code agents | ドメイン特化の静的解析                                              |
| Test execution  | Codex CLI (Bash)   | worktree 内で test コマンド実行 (build は bootstrap smoke を再利用) |

## 1a. Codex 静的レビュー

| Mode               | コマンド                                                          |
| ------------------ | ----------------------------------------------------------------- |
| diff (uncommitted) | `codex review --uncommitted`                                      |
| diff (branch)      | `codex review --base $BASE`                                       |
| target             | `codex review --uncommitted` (対象ファイルのコンテキスト copy 後) |

次表は Codex severity の正規化先を定義する。正規化を適用するのは `${CLAUDE_SKILL_DIR}/scripts/merge-findings.py` (§ Finding 重複除去)。`file:line` を持たない finding とスコープ外の finding はスキップする。

| Codex severity | 正規化 |
| -------------- | ------ |
| `[P1]`         | high   |
| `[P2]`         | medium |
| `[P3]`         | drop   |

## 1b. Audit Reviewers

`/audit` のファイルルーティング表をそのまま使う。ファイルタイプごとの reviewer 割り当ても同じ表に従う。ルーティング表側の変更は、`/assert` の reviewer 割り当てにもそのまま波及する。

各 reviewer はそれぞれ独立した background Task として起動する。

| 制約         | 値                                    |
| ------------ | ------------------------------------- |
| 入力         | 割り当てファイル一覧 / finding-schema |
| 最大並列     | 10 (超過時はバッチ分割)               |
| タイムアウト | reviewer ごと 120s                    |

## 1c. テスト実行

Phase 0 の成功が前提で、失敗していた場合はスキップする。build はここでは再実行せず、bootstrap の build smoke 結果を Evidence 表の Build 列に使う。worktree 内で下記コマンドを実行する。

```bash
codex exec -c sandbox_workspace_write.network_access=true -C <worktree-path> "Run the project test command. Report: (1) test exit code and last 50 lines of stderr if non-zero, (2) test summary (total/passed/failed)." </dev/null
```

| 制約         | 値                                                          |
| ------------ | ----------------------------------------------------------- |
| タイムアウト | 600s                                                        |
| 取得         | test pass / fail (stderr 付き)。Build 値は bootstrap 再利用 |

## Finding 重複除去

severity 正規化と `file:line` をキーにした重複除去は `${CLAUDE_SKILL_DIR}/scripts/merge-findings.py` に委譲する。category はキーに含めず、複数ソースで検出された finding はソースタグを併合して `[codex, reviewer-security]` のように記録する。

orchestrator は 1a の Codex findings と 1b の reviewer findings を 1 つの JSON 配列にまとめてファイルに保存し、スクリプトに渡す。配列の各要素は最低限 `{file, line, severity, source}` を持つ。severity は `[P1]/[P2]/[P3]` でも `high/medium/low` でも渡してよい。正規化はスクリプトが行う。`[P3]` および正規化できない未知の severity は drop する (issues に含めない)。

```bash
"${CLAUDE_SKILL_DIR}/scripts/merge-findings.py" <findings-json-file>
```

`file:line` を持たない finding とスコープ外の finding は、スクリプトに渡す前に orchestrator 側で除外しておく。スクリプト出力を Phase 2 の challenger と verifier に渡す。
