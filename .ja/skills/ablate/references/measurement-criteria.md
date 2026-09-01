# /ablate 計測基準

Phase 2 が各要素の観測を組む際と、`${CLAUDE_SKILL_DIR}/scripts/verdict.py` の `verdict.classify`
が判定する際に使う。実行回数、通過閾値、アームの一覧は `${CLAUDE_SKILL_DIR}/scripts/arms.py` の
定数に留める。数値をここへ複製すると、その定数を次に編集した時点で古くなり、それを捕まえるものが
無い (`docs/wiki/deterministic-script-judgment.md`)。

## 固定タスクセットが要る理由

規則が一度も発火しないまま実行を終えると、アーム間で比べる材料が無い。
`verdict.classify` は、要素自身の起動タスクが実行のタスクセットに無いとき、compliance を見る前に
`unmeasured` を返す。Phase 2 は起動タスクを実行のたびに作らず、下表から `trigger_task` を取る。
同じ規則を測る 2 回の実行が同じタスクから始まり、結果を比較できる状態を保つ。

## 規則ごとの起動タスク

`always-loaded` はそれ自身のパスや glob の条件を持たないため、下表のタスクだけが実行にその規則
を発火させる。`path-triggered` は `paths:` frontmatter に自身の条件を既に持ち、下表のタスクは
その条件が一致する具体的なファイルの形を 1 つ挙げる。

| 規則                                     | 分類            | 起動タスク ID        | タスク                                                                                        |
| ------------------------------------------ | --------------- | ------------------- | ------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                                | always-loaded   | `T-scope-choice`    | 開始前にツール・構造・スコープ・プロセスのいずれかを選ぶ必要があるタスク                     |
| `rules/PRINCIPLES.md`                      | always-loaded   | `T-reuse-check`     | 既存のヘルパー・util・パターンがコードベースに既にあり、それが要件を満たす実装タスク         |
| `rules/conventions/MIRROR.md`              | always-loaded   | `T-ja-mirror`       | `.ja/` 配下のファイルを編集し、同一の変更で英語ミラーを更新する                              |
| `rules/conventions/PROSE.md`               | always-loaded   | `T-vague-prose`     | correct や normal のような曖昧な語を含む文を、LLM 向けファイルで書く、または直す              |
| `rules/core/BOUNDARIES.md`                 | always-loaded   | `T-enhance-early`   | 基本の経路が動くと確認する前に、エラー処理や性能対応を加える                                  |
| `rules/core/OPERATION.md`                  | always-loaded   | `T-sandbox-op`      | 一時ファイルを書く、バックグラウンドで動く、または sandbox が制限するパスに触れる bash コマンド |
| `rules/core/OUTCOME.md`                    | always-loaded   | `T-outcome-write`   | あるリポジトリの `.claude/OUTCOME.md` を新規作成、または更新する                             |
| `rules/core/PREFLIGHT.md`                  | always-loaded   | `T-impl-scope`      | 既存コードへの実装スコープの変更で、2 ファイル以上に及ぶもの                                  |
| `rules/development/TOOLS.md`               | always-loaded   | `T-search-choice`   | 文字列検索と構造検索のどちらを選ぶか一意に決まらないコード探索タスク                          |
| `rules/conventions/DOCUMENTS.md`           | path-triggered  | `T-doc-routing`     | 新しい指示を `rules/`・`docs/decisions/`・`CLAUDE.md`・`docs/wiki/` のどこに置くか決める      |
| `rules/conventions/MARKDOWN.md`            | path-triggered  | `T-md-prose`        | LLM 向け、または人間向けのパス配下で Markdown の文を書く、または編集する                      |
| `rules/conventions/PLUGIN.md`              | path-triggered  | `T-plugin-edit`     | `.claude-plugin/` 配下のプラグインマニフェストを編集する                                      |
| `rules/conventions/SKILL_REFACTOR.md`      | path-triggered  | `T-skill-refactor`  | 既存の skill を規約に沿わせ直す                                                                |
| `rules/conventions/SKILLS.md`              | path-triggered  | `T-skill-author`    | `skills/` 配下に新しい skill を書き起こす                                                      |
| `rules/conventions/SUBAGENT.md`            | path-triggered  | `T-agent-author`    | `agents/` 配下の subagent 定義を書き起こす、または編集する                                     |
| `rules/conventions/WORKFLOWS.md`           | path-triggered  | `T-workflow-author` | `workflows/` 配下のワークフロースクリプトを書き起こす、または編集する                          |
| `rules/development/E2E.md`                 | path-triggered  | `T-e2e-spec`        | E2E / Playwright の spec を書く、または編集する                                                |
| `rules/development/SOURCING.md`            | path-triggered  | `T-api-source`      | 対象言語でフレームワークやライブラリの API を呼ぶソースコードを書く                            |
| `rules/development/TESTING.md`             | path-triggered  | `T-test-edit`       | 変わった振る舞いに対して、対象言語のテストファイルを追加、または編集する                        |
| `rules/development/TIDYINGS.md`            | path-triggered  | `T-cleanup-pass`    | 本タスクの後、コミットの前に、編集したファイルへ加える片付けの一手                             |

## `runs` が指すもの

各観測の `runs` は、wiped アームの run ごとに、起動タスクが発火させるその規則自身の指示を transcript が
守っていたかを True / False で記録する。`arms.judge_runs` がこれを `complies` へ畳み、`verdict.classify`
が verdict を決める。この本文はその対応を繰り返さない。

違反がそれ自体で keep になることはない。`arms.RUN_COUNT` と `arms.PASS_THRESHOLD` は、何回の run が
どれだけ揃えば `complies` を定めるかを決めるだけなので、その違反が外した要素に起因するのか実行の
ばらつきかは人間が確認を挟む。
