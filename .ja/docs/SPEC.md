# SPEC

📌 [English version](../../docs/SPEC.md)

本書は harness の各構成要素の実行契約、つまり入力・出力・停止条件・失敗時の挙動を 1 枚で引ける形に集めたものである。設計意図は繰り返さない。実登録値の正は `settings.json` である。本書の配線表はそこから写したものだが、1 スクリプトを `Write` と `Edit` に分けて登録している箇所は 1 行にまとめている。

## 参照先の切り分け

知りたいことによって読む文書が変わる。本書は「何が起きるか」を扱い、他の文書は「なぜそうしたか」を扱う。

| 知りたいこと                       | 参照先                                                     |
| ---------------------------------- | ---------------------------------------------------------- |
| 契約 (入力・出力・停止・失敗方針) | 本書                                                       |
| レイヤー構成の設計意図             | [DESIGN.md](./DESIGN.md)                                   |
| hook の設計意図と命名              | [HOOKS.md](./HOOKS.md)                                     |
| Skill と Agent の使い分け          | [SKILLS_AGENTS.md](./SKILLS_AGENTS.md)                     |
| 個別の決定に至った経緯             | [docs/decisions](../../docs/decisions)                     |
| 外部 CLI の役割                    | [CLI_TOOLS.md](./CLI_TOOLS.md)                             |
| 用語の定義                         | [GLOSSARY.md](./GLOSSARY.md)                               |

## システム境界

このリポジトリが持つのはスクリプトと Markdown だけである。実行時に呼ぶバイナリの多くはリポジトリの外にあり、未導入なら該当 hook は何もせず終了する。

| 要素                                        | 実体                                    | 供給元                          |
| ------------------------------------------- | --------------------------------------- | ------------------------------- |
| hook スクリプト                             | `hooks/**/*.py`, `hooks/**/*.sh`        | 本リポジトリ                    |
| skill / agent / workflow 定義               | `skills/`, `agents/`, `workflows/`      | 本リポジトリ                    |
| `guardrails`, `formatter`, `gates`, `assay` | Rust バイナリ                           | `brew install thkt/tap/{tool}`  |
| `scout`, `recall`, `sae`, `xr`              | Rust CLI                                | `brew install thkt/tap/{tool}`  |
| `ast-grep`                                  | Rust バイナリ                           | `brew install ast-grep`         |
| `codegraph`                                 | mise shim 経由のバイナリ                | mise                            |
| `hooks/herdr-agent-state.sh`                | herdr が生成したファイル                | herdr (再インストールで上書き) |
| `textlint`, `oxlint`, `oxfmt`               | devDependencies                         | `bun install`                   |
| `ruff`, `rumdl`                             | Python 製 linter                        | pipx (CI は版固定)              |
| Amphetamine                                 | macOS アプリ                            | 外部アプリ                      |

## 構成要素と責務

ディレクトリが責務の単位である。実行主体の列は、そのファイルを誰が読んで動かすかを示す。

| ディレクトリ  | 責務                                       | 実行主体             |
| ------------- | ------------------------------------------ | -------------------- |
| `rules/`      | 規約と原則。読み込むファイルは `paths:` frontmatter が決める | Claude 本体          |
| `skills/`     | 手順と知識のモジュール                     | Skill tool / モデル  |
| `agents/`     | fork 実行される専門エージェント定義        | Agent tool           |
| `workflows/`  | 決定論的なオーケストレーション スクリプト  | Workflow tool        |
| `hooks/`      | ツール呼び出しに割り込むスクリプト         | Claude Code harness  |
| `docs/`       | 人間向けの設計文書と決定記録               | 人間                 |
| `tests/`      | 規約をコードで縛る横断テスト               | `node --test`        |

## Hook 契約

### 入出力

hook は stdin から JSON payload を受け取り、stdout に JSON か additionalContext 用のテキストを書く。終了コードは全 hook が 0 固定である。0 以外は設計上の結果ではなく破損であり、`hooks/_lib/hook_harness.py` の `checked` が AssertionError を上げてテストを落とす。この確認が効くのは harness 経由で起動する Python hook 12 本であり、シェル hook 2 本は各自のテストが結果だけを見る。

呼び出しを止める hook は `hook_payload.deny` を通し、同じ形の封筒を出す。`permissionDecision` に入るのは `allow`, `deny`, `ask`, `defer` の 4 値だけである。それ以外を書くとスキーマ検証で落ち、ゲートは何も止めないまま無言で通る。

| 出力                | 形                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------- |
| 拒否 (PreToolUse)   | `{"hookSpecificOutput":{"hookEventName","permissionDecision","permissionDecisionReason"}}` |
| 文脈注入            | `additionalContext` を含む JSON、または素のテキスト                                   |
| 何もしない          | 空出力で `exit 0`                                                                     |

### 配線

以下は `settings.json` の登録順である。同一 matcher 内は上から順に走り、`if` 条件を満たさない hook は起動しない。`if` 条件を持つ 4 スクリプトは `Write` 用と `Edit` 用に 2 回ずつ登録されており、表ではその対を 1 行に畳んでいる。`EnterPlanMode` と `WebFetch`/`WebSearch` はスクリプトを持たない。deny 封筒を直接 `echo` する登録であり、代替手段 (`/think` と `scout` CLI) を理由文で示す。

| イベント          | matcher            | 実体                                            | if 条件            | timeout |
| ----------------- | ------------------ | ----------------------------------------------- | ------------------ | ------- |
| PreToolUse        | `Bash`             | `pre-bash/package_manager_rewrite.py`           | なし               | 15      |
| PreToolUse        | `Bash`             | `security/npm_install_guard.py`                 | なし               | 60      |
| PreToolUse        | `Bash`             | `security/rm_to_trash.py`                       | なし               | 15      |
| PreToolUse        | `Bash`             | `security/git_sandbox_guard.py`                 | なし               | 15      |
| PreToolUse        | `Bash`             | `pre-bash/body_proofread.py`                    | なし               | 60      |
| PreToolUse        | `Bash`             | `pre-bash/issue_body_gate.py`                   | なし               | 30      |
| PreToolUse        | `Bash`             | `pre-bash/client_identifier_gate.py`            | なし               | 30      |
| PreToolUse        | `Write\|Edit`      | `edit/rust_pre_edit.py`                         | `**/*.rs`          | 60      |
| PreToolUse        | `Write\|Edit`      | `guardrails`                                    | なし               | 30      |
| PreToolUse        | `EnterPlanMode`    | インライン `echo` による deny                   | なし               | なし    |
| PreToolUse        | `WebFetch\|WebSearch` | インライン `echo` による deny                | なし               | なし    |
| PostToolUse       | `Write\|Edit`      | `edit/rust_post_edit.py`                        | `**/*.rs`          | 30      |
| PostToolUse       | `Write\|Edit`      | `edit/textlint_fix.py`                          | `**/*.md`          | 60      |
| PostToolUse       | `Write\|Edit`      | `edit/mirror_prose_guard.py`                    | `**/.ja/**`        | 10      |
| PostToolUse       | `Write\|Edit`      | `assay`                                         | なし               | 30      |
| PostToolUse       | `Write\|Edit`      | `formatter`                                     | なし               | 30      |
| PostToolUse       | `Write\|Edit`      | `gates`                                         | なし               | 120     |
| PostToolUse       | `Bash`             | `gates changed`                                 | なし               | 120     |
| PostToolUse       | `*`                | `integrations/amphetamine_agent_session.py background` | なし        | 15      |
| SessionStart      | `*`                | `lifecycle/recall_index.py`                     | なし               | 60      |
| SessionStart      | `*`                | `herdr-agent-state.sh session`                  | なし               | 10      |
| UserPromptSubmit  | なし               | `integrations/amphetamine_agent_session.py acquire` | なし           | 15      |
| UserPromptSubmit  | なし               | `codegraph prompt-hook`                         | なし               | 10      |
| Stop              | なし               | `lifecycle/failure-alert.sh stop`               | なし               | 60      |
| Stop              | なし               | `integrations/amphetamine_agent_session.py release` | なし           | 15      |
| StopFailure       | なし               | `lifecycle/failure-alert.sh fail`               | なし               | 60      |

### 個別 hook の判定と失敗方針

fail-close は判断できない入力を通さない方針、advisory は決定を常に allow にして助言だけ返す方針、fail-open は失敗しても機能を落とさない方針である。

| hook                            | 発火                    | 判定                                                              | 失敗方針  |
| ------------------------------- | ----------------------- | ----------------------------------------------------------------- | --------- |
| `rm_to_trash.py`                | Bash                    | `rm` / `rmdir` / `unlink` / `shred` と `find -delete` / `git clean` を deny し `mv ~/.Trash/` へ誘導 | fail-close |
| `npm_install_guard.py`          | Bash                    | `ignore-scripts` 未設定の install を deny。ni 系の別名も同じ扱い  | fail-close |
| `git_sandbox_guard.py`          | Bash                    | サンドボックス下で tree を書き換える git 呼び出しを deny          | fail-close |
| `package_manager_rewrite.py`    | Bash                    | パッケージ マネージャ コマンドを ni 系へ書き換え、決定は常に allow | advisory  |
| `body_proofread.py`             | Bash                    | gh filing と commit の本文を校正し additionalContext で返す       | advisory  |
| `issue_body_gate.py`            | Bash                    | `gh issue create` の本文をタイトル型のテンプレートと照合し、乖離と比較不能をどちらも deny | fail-close |
| `client_identifier_gate.py`     | Bash                    | 本リポジトリの commit で、外部に置いた識別子リストの語を含む staged diff を deny | fail-close |
| `rust_pre_edit.py`              | Write / Edit (`*.rs`)   | clippy の指摘を additionalContext として注入                      | advisory  |
| `rust_post_edit.py`             | Write / Edit (`*.rs`)   | `cargo fmt` の後に clippy を再実行し指摘を返す                    | advisory  |
| `textlint_fix.py`               | Write / Edit (`*.md`)   | 日本語判定を通った Markdown を textlint で自動修正                | advisory  |
| `mirror_prose_guard.py`         | Write / Edit (`.ja/**`) | 日本語を 1 文字も含まない `.ja/` ファイルを警告する。止めない     | advisory  |
| `amphetamine_agent_session.py`  | UserPromptSubmit / PostToolUse / Stop | session_id 単位の参照カウントで Mac のスリープを抑止 | fail-open |
| `recall_index.py`               | SessionStart            | recall の横断索引をバックグラウンドで追いつかせる                 | fail-open |
| `failure-alert.sh`              | Stop / StopFailure      | `end_turn` 以外の終了で音を鳴らす。サブエージェントは対象外       | fail-open |
| `statusline.sh`                 | `statusLine` キー       | モデル名と使用率を描画する。部分表示を許容。`hooks` マップではなく最上位の `statusLine` に登録する | fail-open |
| `herdr-agent-state.sh`          | SessionStart            | herdr の環境変数が揃うときだけ状態を送る                          | fail-open |

`hooks/_lib/` の共有モジュールは、複数の hook が同じ知識を持たないための置き場である。

| モジュール         | 引き受ける知識                                                  |
| ------------------ | --------------------------------------------------------------- |
| `command_scan.py`  | Bash 行のどこがコマンド位置かの判定。ラッパーと環境変数代入を剥がす |
| `gh_filing.py`     | `gh issue create` / `gh pr create` の本文フラグの綴り            |
| `hook_payload.py`  | payload の型付き読み出しと deny 封筒の生成                       |
| `japanese.py`      | 日本語判定としきい値                                             |
| `mirror_prose.py`  | `.ja/` 配下で日本語が消えた状態の検出                            |
| `rust_target.py`   | cargo ワークスペース根の解決と clippy 出力の整形                 |
| `textlint.py`      | textlint の設定解決と実行                                        |
| `hook_harness.py`  | テストからの hook 起動と終了コード確認                           |

## Skill 契約

### frontmatter

`SKILL.md` の frontmatter が起動条件と権限を決める。`allowed-tools` に無いツールは、本文が指示していても呼べない。

| キー            | 役割                                                          | 省略時                     |
| --------------- | ------------------------------------------------------------- | -------------------------- |
| `name`          | 起動名。`/name` と Skill tool の引数が一致する                 | 必須                       |
| `description`   | 起動判断の材料。モデルはこの文だけを見て呼ぶかを決める        | 必須                       |
| `allowed-tools` | 実行中に許すツールの列挙                                      | 呼び出し元の権限を継承     |
| `model`         | 実行モデルの指定                                              | セッションのモデル         |
| `argument-hint` | 引数の形をユーザーに示す文字列                                | 引数なし                   |
| `context`       | `fork` を指定すると本文脈を汚さず別文脈で走る                 | 本文脈                     |
| `agent`         | 対応する agent 名。reviewer 系の skill が持つ                 | なし                       |
| `user-invocable`| `false` ならスラッシュ コマンド一覧に出さない                 | `true`                     |

### 補助資産

skill ディレクトリの下位ディレクトリは名前で役割が決まる。

| ディレクトリ  | 中身                                                  |
| ------------- | ----------------------------------------------------- |
| `scripts/`    | skill が Bash 経由で呼ぶ決定論的スクリプト            |
| `templates/`  | 生成物の骨組み。issue の本文テンプレートなど          |
| `references/` | 本文から参照する補足知識                              |
| `tests/`      | skill 本文と scripts を縛るテスト                     |

### 一覧

ユーザー起動列が「不可」の skill は、モデルが文脈から読み込む知識モジュールである。

| skill                              | model | ユーザー起動 | 成果物または副作用                                  |
| ---------------------------------- | ----- | ------------ | --------------------------------------------------- |
| `census`                           | opus  | 可           | DR 未記録の判断の候補一覧                           |
| `challenge`                        | opus  | 可           | GO / NO-GO の判定と反証                             |
| `checkout`                         | haiku | 可           | git ブランチの作成                                  |
| `commit`                           | haiku | 可           | git commit の実行                                   |
| `dr`                               | opus  | 可           | `docs/decisions/` への MADR v4 ファイル追加         |
| `fix`                              | opus  | 可           | 1 から 3 ファイルの修正                             |
| `issue`                            | opus  | 可           | GitHub Issue の作成                                 |
| `outcome`                          | opus  | 可           | `.claude/OUTCOME.md` の生成と更新                   |
| `pr`                               | opus  | 可           | draft PR の作成                                     |
| `preview`                          | opus  | 可           | PR 差分と Plan の突合結果                           |
| `qualify`                          | opus  | 可           | build-ready / needs-plan / needs-fix / needs-split  |
| `research`                         | opus  | 可           | 調査結果。fork 文脈で走る                           |
| `scribe`                           | 継承  | 可           | `docs/wiki/` への PR 提案                           |
| `slice`                            | opus  | 可           | 依存順に並べた GitHub Issue 群                      |
| `think`                            | opus  | 可           | units と test_command を持つ構造化 plan             |
| `transcribe`                       | 継承  | 可           | 表計算ファイルの Markdown 化                        |
| `use-cli-codegraph`                | 継承  | 不可         | codegraph の呼び出し方の知識                        |
| `use-cli-gcloud`                   | 継承  | 不可         | gsheet と gdoc の呼び出し方の知識                   |
| `use-cli-recall`                   | 継承  | 不可         | recall の呼び出し方の知識                           |
| `use-cli-scout`                    | 継承  | 不可         | scout の呼び出し方の知識                            |
| `use-context-reviewer-readability` | 継承  | 不可         | `reviewer-readability` を fork で起動               |
| `use-context-reviewer-security`    | 継承  | 不可         | `reviewer-security` を fork で起動                  |
| `use-context-reviewer-silence`     | 継承  | 不可         | `reviewer-silence` を fork で起動                   |
| `use-context-reviewer-testability` | 継承  | 不可         | `reviewer-testability` を fork で起動               |
| `use-context-root-cause-analysis`  | 継承  | 不可         | 仮説消去による原因分析の手順                        |
| `use-workflow-pageshot`            | opus  | 不可         | スクリーンショットまたは動画のパス                  |
| `use-workflow-tdd-cycle`           | 継承  | 不可         | RGRC サイクルの手順                                 |

## Agent 契約

### frontmatter と出力

agent は必ず fork 文脈で走り、呼び出し元の会話履歴を持たない。`tools` に列挙したツールだけが使え、`Bash(git:*)` のような括弧付きの指定はサブコマンドまで絞る。

| キー          | 役割                                             |
| ------------- | ------------------------------------------------ |
| `name`        | Agent tool の `subagent_type` に渡す名前         |
| `description` | 起動判断の材料                                   |
| `tools`       | 許すツールの列挙                                 |
| `model`       | 実行モデル                                       |

指摘を返す agent は `agents/_lib/finding-schema.md` の Base Fields に従う。Agent 行は起動側が埋めるため、reviewer 自身は書かない。

| フィールド     | 内容                                          |
| -------------- | --------------------------------------------- |
| `Severity`     | critical / high / medium / low                |
| `Category`     | 領域別の分類                                  |
| `Location`     | `file:line`                                   |
| `Evidence`     | コード断片または観測                          |
| `Trigger`      | 再現できる発火条件                            |
| `Reasoning`    | 問題である理由                                |
| `Fix`          | 修正案                                        |
| `Verification` | 検証の種類と問い                              |

### 一覧

reviewer は 18 体である。`audit` の ROUTING が拡張子から選ぶのはうち 15 体で、`causation`, `readability`, `conformance` の 3 体は skill か `build` から直接呼ぶ。`agents/_lib/` は agent 本体ではなく、finding の書式 (`finding-schema.md`) と重大度の較正例 (`calibration-examples.md`) を置く共有資産である。

| 分類      | agent                                                                                                                   | model                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| critics   | `critic-audit`, `critic-design`, `critic-evidence`                                                                      | opus                         |
| enhancers | `enhancer-code`, `enhancer-evidence`, `enhancer-integration`                                                            | opus                         |
| explorers | `explorer-feature`                                                                                                      | opus                         |
| generators| `generator-snapshot`, `generator-test`                                                                                  | sonnet / opus                |
| resolvers | `resolver-build`                                                                                                        | opus                         |
| reviewers | `reviewer-accessibility`, `reviewer-causation`, `reviewer-conformance`, `reviewer-coverage`, `reviewer-design`, `reviewer-duplication`, `reviewer-readability`, `reviewer-react-pattern`, `reviewer-rust`, `reviewer-security`, `reviewer-silence`, `reviewer-testability` | opus |
| reviewers | `reviewer-efficiency`, `reviewer-operations`, `reviewer-progressive`, `reviewer-prompt`, `reviewer-resilience`, `reviewer-reuse` | sonnet |

## Workflow 契約

### 起動と引数

workflow は `Workflow({name, args})` で起動する。args はオブジェクト、JSON 文字列、素の文字列のいずれでも受け取り、各スクリプトの `parseArgs` が 1 つの形に正規化する。素の文字列は workflow ごとの短縮形として解釈される。`audit`, `polish`, `assert` では scope、`adrift` では DR ディレクトリか id 列になる。

`repo` は全 workflow で必須である。絶対パスが無い呼び出しは `{stopped: "no-repo"}` を返し、対象リポジトリを取り違えたまま走ることはない。

| workflow | args                                                     | phases                                                              | stopped                                                        |
| -------- | -------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `build`  | `{issue, repo, base?}`                                   | Load / Revalidate / Branch / Code / Cleanup / Verify / Ship         | 14 種 (下表)                                                   |
| `code`   | `{plan, repo, model?, commit?, issue?, untracked_baseline?}` | Implement / Verify                                               | `no-plan`, `no-repo`                                           |
| `audit`  | `{scope?, focus?, repo, noLimit?, skipPreflight?}`        | Pre-flight / Route / Review / Challenge / Verify / Integrate / Snapshot | `no-repo`                                                  |
| `polish` | `{scope?, repo, mode?, base?}`                           | Review / Challenge / Fix / Rejudge / Cleanup                        | `no-repo`                                                      |
| `assert` | `{scope?, base?, repo}`                                  | Bootstrap / Evidence / Challenge / Triage / Synthesize / Cleanup    | `no-repo`, `no-changes`, `codex-missing`                       |
| `shake`  | `{scope?, base?, repo}`                                  | Route / Shake / Fix                                                 | `no-repo`, `no-targets`                                        |
| `adrift` | `{dir?, repo, focus?}`                                   | Detect / Scan / Report                                              | `no-repo`, `no-drs`, `no-matching-drs`                         |

`build` の停止コードは、その issue の `## Plan` を直せば防げたかどうかで 2 群に分かれる。スクリプトはこの区別を `PLAN_QUALITY` として持ち、実行ごとに 1 行の jsonl に記録する。

| 群                       | コード                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| Plan の改善で防げる      | `no-plan`, `extraction-failed`, `invalid-plan`, `extraction-mismatch`, `oversized-unit`, `plan-drift` |
| Plan とは無関係          | `no-issue`, `no-repo`, `invalid-base`, `no-issue-body`, `dirty-branch-point`, `revalidate-failed`, `revalidate-incomplete`, `code-failed` |

### 返り値

返り値は呼び出し元が読む唯一の一次情報である。報告書ファイルを書く workflow でも、判断に要る数はここに載る。

| workflow | 主なキー                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------- |
| `build`  | `pr_url`, `committed`, `unstaged`, `conformance_status`, `conformance_high`, `missing_tests`, `untouched_plan_files`, `backlog_candidates` |
| `code`   | `completed`, `skipped`, `anomalies`, `commits`, `verification`, `tests_pass`, `gates_pass`        |
| `audit`  | `findings`, `survivors`, `needs_context`, `tally`, `assignments`, `zero_reviewer_files`, `snapshot` |
| `polish` | `findings`, `survivors`, `fixed`, `reopened`, `needs_context`, `cleanup`                          |
| `assert` | `gate`, `gate_reason`, `build`, `tests`, `issues`, `root_causes`, `outcome_ref`, `report`         |
| `shake`  | `ecosystem`, `runs_per_dimension`, `targets`, `dropped`, `blockers`                               |
| `adrift` | `report_path`, `report_written`, `findings`, `priorities`, `unverifiable`, `external_refs`, `followup_candidates` |

### スクリプトが握る判断

OUTCOME に書いた「品質保証を LLM の裁量から決定論的な層へ移す」は、この列で具体になる。以下の判断は agent に返させず、スクリプトが計算する。

| workflow | スクリプトが持つ判断                                                                    |
| -------- | ---------------------------------------------------------------------------------------- |
| `audit`  | ファイル glob から reviewer への割り当て表                                              |
| `polish` | confirmed / disputed / downgraded / needs_context の振り分けと、修正後の再判定           |
| `shake`  | 4 次元それぞれ 10 回という実行回数と、confirmed-flaky / latent-flaky / stable の分類     |
| `assert` | Ready / Ready (caveat) / NotReady の三値ゲートを build と tests と issues から計算       |
| `adrift` | DR ごとの網羅列挙と reviewer ルーティング、file:line 単位の重複統合                      |
| `build`  | plan の抽出結果の検証、id 突合、停止コードの決定                                        |
| `code`   | unit ごとの Red 確認と、テストを持たない unit の直接実装への振り分け                    |

### ネスト

workflow は他の workflow を 1 階層だけ入れ子にできる。ルーティング表を写経せずに再利用するための構成である。重い保証 (`audit`, `polish`) は draft PR に対して人が起動する。

| 呼び出し元 | 呼ぶ workflow    | 目的                                       |
| ---------- | ---------------- | ------------------------------------------ |
| `build`    | `code`           | unit ごとの TDD 実装                       |
| `assert`   | `audit`          | 静的証拠の収集                             |

## 品質ゲート

### ローカル

編集と Bash の直後に外部バイナリが走る。`gates` は 120 秒の枠を持ち、`Write`/`Edit` では差分全体を、`Bash` の後は `gates changed` として変更分だけを見る。

### CI

`.github/workflows/test.yml` は push (main) と pull request で走る。ジョブは 1 つで、以下のステップを順に実行する。Python の探索に unittest discovery を使わないのは、テスト ディレクトリがパッケージではなくルートから再帰できないためである。ruff と rumdl は JS 依存に無いため、版を直に固定している。

| ステップ      | コマンド                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------- |
| Node tests    | `node --test` を `tests/`, `agents/**/tests/`, `hooks/**/tests/`, `skills/**/tests/`, `workflows/**/tests/` に対して実行 |
| Python tests  | `find agents hooks skills workflows -name '*_test.py'` を 1 ファイルずつ実行                  |
| Shell tests   | `find hooks -name '*.test.sh'` を 1 ファイルずつ bash で実行                                  |
| oxlint        | `npx oxlint`                                                                                  |
| textlint      | `npx textlint '.ja/**/*.md'`                                                                  |
| ruff          | `pipx run --spec ruff==0.16.4 ruff check .`                                                   |
| ruff format   | `pipx run --spec ruff==0.16.4 ruff format --check .`                                          |
| rumdl         | `pipx run --spec rumdl==0.2.58 rumdl check .`                                                 |

### 設定ファイル

lint の対象と閾値は設定ファイルが持つ。文書側で数値を繰り返さない。

| ファイル              | 決めること                                                              |
| --------------------- | ----------------------------------------------------------------------- |
| `.textlintrc.json`    | 日本語の文長上限、読点数の上限、である調の統一、半角と全角の間の空白    |
| `.rumdl.toml`         | Markdown 検査で無効にする規則                                           |
| `.oxlintrc.json`      | JavaScript の静的検査                                                   |
| `.guardrails.json`    | guardrails の規則と、意図的に脆弱な fixture への除外                    |
| `ruff.toml`           | Python の検査と整形                                                     |
| `pyrightconfig.json`  | Python の型検査                                                         |
| `knip.json`           | 未使用依存の検出                                                        |

### 横断テスト

`tests/` は規約をコードで縛る。文書に書いただけでは守られなかったものが、ここに落ちている。

| テスト                     | 縛る規約                                                        |
| -------------------------- | --------------------------------------------------------------- |
| `decision-records.test.js` | DR 番号の重複と、見出しの番号がファイル名と一致すること         |
| `live-instructions.test.js`| 指示文の表記。旧称 ADR、home 起点パス、絞りのない Bash 権限、`.claude/` の無い workspace パス |
| `manual-lane.test.js`      | 手動レーンの skill と build のステージ対応、共有ルールの読み手表記 |
| `phase-handoff.test.js`    | 受け渡す Phase を受け取る側が名指ししていること                 |
| `prose-language.test.js`   | 英語側のテスト名が日本語でないこと                              |
| `skill-h1.test.js`         | wrapper skill の H1 が自名、ユーザー起動 skill の H1 がスラッシュ コマンド始まりであること |
| `table-paragraph.test.js`  | 表の直後に段落を置かないこと                                    |

## 配布契約

`.claude-plugin/marketplace.json` は単一プラグイン構成である。`build` を入れるとリポジトリ全体が 1 度クローンされ、skill, agent, workflow のすべてが `build:` 名前空間で読み込まれる。

| 項目           | 値                          |
| -------------- | --------------------------- |
| marketplace 名 | `thkt-development-workflows`|
| プラグイン     | `build` のみ                |
| version        | 4.1.0                       |
| source         | github の `thkt/dotclaude`  |

## ミラー契約

`.ja/` が正であり、英語側は同一コミットでミラーする。詳細は[MIRROR.md](../rules/conventions/MIRROR.md)にある。

| 対象                            | 扱い                                                       |
| ------------------------------- | ---------------------------------------------------------- |
| 散文を持つファイル              | 散文だけ翻訳し、識別子とスキーマは同一のまま               |
| 散文を持たないファイル          | 同一コピー                                                 |
| `output-styles/**`              | ミラーしない。実パスに日本語で 1 ファイルだけ置く          |
| テスト                          | 英語側にのみ置く                                           |

## 追加時に触る場所

新しい要素を足すときに触るファイルと、追加が効いていることを確かめるコマンドを示す。

| 追加するもの | 触るファイル                                                            | 確認                                        |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------- |
| hook         | `hooks/<event>/`, `settings.json`, `hooks/<event>/tests/`               | `find hooks -name '*_test.py'` と `find hooks -name '*.test.sh'` |
| skill        | `skills/<name>/SKILL.md`, `skills/<name>/tests/`, `.ja/skills/<name>/`  | `node --test "skills/**/tests/*.test.js"`   |
| agent        | `agents/<category>/<name>.md`, `.ja/agents/<category>/`                 | `node --test "agents/**/tests/*.test.js"`   |
| workflow     | `workflows/<name>.js`, `workflows/tests/`, `.ja/workflows/`             | `node --test "workflows/**/tests/*.test.js"`|
| DR           | `docs/decisions/NNNN-*.md`                                              | `node --test tests/decision-records.test.js`|
| 文書         | `.ja/docs/<NAME>.md` を先、`docs/<NAME>.md` を同一コミットで            | `npx textlint '.ja/**/*.md'` と `rumdl check .` |
