---
name: issue
description: 構造化されたタイトルと本文で GitHub Issue を生成する。単独で成立し、前段を要求しない。challenge / research の成果物が会話にあれば本文の根拠に使う。/think の plan 下書きがあれば `## Plan` 節へ移設する。issue 番号を渡すと、起票済みで Plan 節を持たない issue へ plan を転記する。
when_to_use: Issue作って, Issue書いて, Issue作成, GitHub Issue, build に渡す準備, Plan転記
allowed-tools: Bash(gh:*) Bash(cat:*) Bash(ugrep:*) Read LS AskUserQuestion
model: opus
argument-hint: "[issue description | issue number]"
---

# /issue - GitHub Issue 生成

## 入力

`$ARGUMENTS` は Issue 説明。空なら AskUserQuestion で説明を尋ねる。

issue 番号か URL だけを受け取ったときは、起票済み issue へ plan を転記する。`gh issue view <ref> --json title,body` で本文を取り、Phase 2 の重複照合から始める。人が書いた本文は保持する。plan 下書きが無ければ `/think` の実行を提案して止まり、`## Plan` を既に持つ issue は `/qualify` の検分に回す。

## 言語

`~/.claude/settings.json` から `language` を読み、その言語で Issue 本文とテンプレートを翻訳する。未設定なら英語をデフォルトとする。テンプレート由来の見出しは英語のまま維持する。

## Phase 1: 起草

1. `.claude/OUTCOME.md` を読み、無ければ `/outcome` で stub を生成する。issue が outcome state の内側にあるか確認する。外側なら、非ゴールの再定義か別タスクへの分割かを AskUserQuestion で問う
2. 説明から種別を検出する
3. bug なら軽微かを判定し、軽微なら起票せず `/fix` で直す選択肢を出す
4. feature か bug で、Why が説明から読み取れない場合、${CLAUDE_SKILL_DIR}/references/why-wall-bouncing.md の手順で詰める
5. 説明と手順 4 の結果から criteria を挙げ、独立して実装可能なものが 2 つ以上あれば分割を問う
6. plan 下書きが無いとき、`/think` の実行を提案する。対象は build workflow へ渡す規模の issue と、説明が実装方針を名指す issue。規模の判断がつかないときも提案する
7. テンプレートを選び、タイトルと本文を生成する。未決の判断は AskUserQuestion で決め、未検証の事実は Read や ugrep で確かめる。どちらも推測のまま本文に書かない

### 種別判定

判別不能な場合は `feature` をデフォルトとする。タイトルには種別をキャピタライズして角括弧で囲ったプレフィックスを付ける。

| 種別    | 用途                                     |
| ------- | ---------------------------------------- |
| bug     | 既存のものが壊れているか期待通り動かない |
| feature | 新しい能力や拡張要望                     |
| docs    | ドキュメント追加や訂正                   |
| chore   | メンテナンス、設定、依存更新             |

### 軽微 bug の導線

軽微とは、次の 3 基準をすべて満たす bug を指す。原因未特定の間欠 bug は該当しない。起票する場合も本文フッターに「軽微につき `/fix` で対応してもよい」と注記する。

- 変更が 1 ファイルに収まる
- 再現手順が確定している
- コードベースの横断調査が不要

### テンプレート選択

`gh api "repos/{owner}/{repo}/contents/.github/ISSUE_TEMPLATE" --jq '.[].name'` で列挙し、種別に対応するものを下表の上から順に骨格へ取る。リポジトリ自身のものを先に取るのは、Web UI からの起票がそれを使うため。無視すると同じ種別の issue が 1 つの tracker に 2 通りの形で並ぶ。

上 2 つは Web UI が埋めさせる最小要件。CLI 起票が節を足すのは逸脱ではない。骨格が薄くても、feature は `Acceptance Criteria` と `Testing Decisions` を書く。bug は `Steps to Reproduce` と `Expected vs Actual` を書く。

| 骨格                           | 節名の取り方                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------- |
| リポジトリの `<type>.yml`      | 各 `body` 要素の `attributes.label`。必須は `validations.required` が真のものだけ |
| リポジトリの `<type>.md`       | 先頭 frontmatter の `name`/`about`/`labels`/`title` を外した本文                  |
| skill の `templates/<type>.md` | `## Template` 内のコードフェンス                                                  |

### 分割判定

選択肢は「1 issue のまま」か「epic と子 issue に分割」。1 つの成果物を検証するだけの細かいチェックは数えず、1 issue 内に留める。問うときは、各 criteria が今着手できるかを添える。未実装の仕組みを待つものが混ざると、分割は着手できない issue を並べる。N 件の起票は取り消しにくいため、自動分割はしない。承認時はこの issue を epic として起票し、以降のフローはそのまま epic に通す。

タイトルの型は検出した種別のままにする。epic は分割の結果であって内容の種別ではない。`[Epic]` に変えると対応する骨格が無く、検証が type_mismatch で落ちる。

## Phase 2: 推敲

1. ${CLAUDE_SKILL_DIR}/references/prose-review.md の基準で本文をインライン精査する。Phase 3 で移設する Plan 節は対象外とし、手を入れない。番号経路では行わない
2. 会話に challenge の verdict と findings があれば、折り込むべき指摘だけを 1 回反映する。verdict と findings 自体は本文に入れない。番号経路では行わない
3. plan 下書きがあれば、前項までの編集を終えた本文を ${CLAUDE_SKILL_DIR}/references/duplication-match.md の手順で照合する。どの下書きを選ぶかもそこに従う。無ければこの照合を省く。番号経路では検出で止め、AskUserQuestion で承認されたときだけ本文を編集する

## Phase 3: Plan 移設

/think の plan 下書きがあるときだけ実施し、無ければ節ごと省略する。Phase 2 の照合で選んだ plan 下書きを Read し、`## Plan` と `## Backlog candidates` の両節をそのまま本文へ移設する。書式と検証は `/think` の書き出し時と build の Load validate が担い、移設した内容には手を入れない。

## Phase 4: 起票

1. Issue プレビューを提示する。新規内容は足さず本文が持つものを写す。番号経路は本文全体でなく、変える節と足す節だけを並べる。AskUserQuestion で確認し、新規起票は `Create this issue?`、番号経路は `Update this issue?` と尋ねる
2. `cat` の heredoc で本文を一時ファイルへ書き出し、${CLAUDE_SKILL_DIR}/scripts/validate-issue-body.py <テンプレート選択で選んだ骨格ファイル> <title> <body-file> を実行する。エラーは ${CLAUDE_SKILL_DIR}/references/validation-errors.md に従って対処し、直したら再実行する。番号経路は骨格ファイルが分からないので行わない
3. exit 0 になったらラベルを付けて `gh issue create --title "<title>" --body-file <path>` で起票し、出力から Issue URL を取得する。番号経路は検証を経ずに `gh issue edit <ref> --body-file <path>` で書き戻す
4. 下表から渡し先を選んで提案する。いずれも自動では起動しない

| 渡し先         | 条件                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| `/slice`       | Phase 1 で分割を承認済み。起票した epic 番号を添える                      |
| `/fix <番号>`  | 1〜3 ファイルに収まる修正                                                 |
| build workflow | 4 ファイル以上か新機能。番号を渡す                                        |
| `/qualify`     | build workflow へ渡す前に検分したいとき。`## Plan` 節が実装に足るかを見る |

### 起票の制約

`<path>` は変数でなくリテラルの絶対パスで書く。hook が変数を展開できず起票が止まるため。`priority:*` は必須で、影響度に応じて critical、high、medium、low から選ぶ。骨格が priority の節を持つときは、その値とラベルを揃える。番号経路も同じで、本文の値とラベルが食い違っていれば `gh issue edit --add-label` で揃える。それ以外のラベルはリポジトリの慣例に合わせる。
