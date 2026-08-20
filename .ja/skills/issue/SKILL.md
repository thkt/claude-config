---
name: issue
description: 構造化されたタイトルと本文を持つ GitHub Issue を生成する。会話に challenge / research の成果物があれば、本文の根拠として使う。/think の plan 下書きがあれば `## Plan` 節へ移す。issue 番号を渡すと、`## Plan` 節のない起票済み issue に plan を転記する。
when_to_use: Issue作って, Issue書いて, Issue作成, GitHub Issue, build に渡す準備, Plan転記
allowed-tools: Bash(gh:*) Bash(cat:*) Bash(ugrep:*) Bash(${CLAUDE_SKILL_DIR}/scripts/*) Read LS AskUserQuestion
model: opus
argument-hint: "[issue description | issue number]"
---

# /issue - GitHub Issue の生成

## 入力

`$ARGUMENTS` を Issue の説明として扱う。空の場合は AskUserQuestion で説明を尋ねる。

issue 番号または URL だけを受け取った場合は、起票済み issue に plan を転記する。`gh issue view <ref> --json title,body` で本文を取得し、Phase 2 の重複照合から始める。既存の本文は、plan の転記に必要な箇所以外は変更しない。plan 下書きがなければ `/think` の実行を提案して止まる。`## Plan` 節がすでにある issue は、代わりに `/qualify` で検分する。

## 言語

`~/.claude/settings.json` から `language` を読み、指定された言語で Issue 本文を生成する。テンプレートの本文もその言語に翻訳する。未設定の場合は英語をデフォルトとする。テンプレート由来の見出しは英語のまま維持する。

## Phase 1: 起草

1. `.claude/OUTCOME.md` を読み、なければ `/outcome` で stub を生成する。issue が outcome state の範囲内にあるか確認する。範囲外の場合は、非ゴールを再定義するか、別タスクとして切り分けるかを AskUserQuestion で確認する
2. 説明から種別を検出する
3. bug なら軽微かを判定し、軽微なら起票せず `/fix` で直す選択肢を出す
4. feature または bug で、説明から Why を読み取れない場合は、${CLAUDE_SKILL_DIR}/references/why-wall-bouncing.md の手順に従って明確にする
5. 説明と手順 4 の結果から criteria を列挙し、独立して実装できる criteria が 2 つ以上あれば分割を問う
6. plan 下書きがなければ `/think` の実行を提案する。ただし、変更が 1〜3 ファイルに収まると判断できる修正に限り、提案を省略してよい。説明で実装方針が明示されている場合は、規模によらず提案する
7. テンプレートを選び、タイトルと本文を生成する。未決事項は AskUserQuestion でユーザーに確認し、未検証の事実は Read や ugrep で確認する。いずれも推測のまま本文に書かない

### 種別判定

種別を判別できない場合は `feature` をデフォルトとする。タイトルには、`[Feature]` のように、種別名の先頭を大文字にして角括弧で囲んだプレフィックスを付ける。

| 種別    | 用途                                                   |
| ------- | ------------------------------------------------------ |
| bug     | 既存機能が動作しない、または期待結果と異なる動作をする |
| feature | 新機能または既存機能の拡張要望                         |
| docs    | ドキュメント追加や訂正                                 |
| chore   | 保守、設定変更、依存関係の更新                         |

### 軽微 bug の導線

軽微な bug とは、次の 3 基準をすべて満たすものを指す。原因を特定できていない間欠的な bug は該当しない。起票する場合は、本文の末尾に「軽微につき `/fix` で対応してもよい」と注記する。

- 変更が 1 ファイルに収まる
- 再現手順が確定している
- コードベースの横断調査が不要

### テンプレート選択

`gh api "repos/{owner}/{repo}/contents/.github/ISSUE_TEMPLATE" --jq '.[].name'` でテンプレートを列挙する。種別に対応する骨格を下表の上から順に探して採用する。リポジトリ内のテンプレートを優先し、Web UI と CLI から起票される issue の骨格を揃える。

上の 2 種類は、Web UI で入力を求める最小要件を定める。CLI からの起票時に追加の節を設けても逸脱にはならない。骨格に含まれていない場合でも、feature には `Acceptance Criteria` と `Testing Decisions` を書く。bug には `Steps to Reproduce` と `Expected vs Actual` を書く。

| 骨格                           | 節名の取り方                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| リポジトリの `<type>.yml`      | 各 `body` 要素の `attributes.label` を節名とする。`validations.required` が真の要素だけを必須とする |
| リポジトリの `<type>.md`       | 先頭の frontmatter から `name`/`about`/`labels`/`title` を除いた本文                                |
| skill の `templates/<type>.md` | `## Template` 直下のコードフェンス                                                                  |

### 分割判定

選択肢は「1 件の issue として扱う」と「epic と子 issue に分割する」の 2 つとする。1 つの成果物を検証するだけの細かいチェックは、独立して実装できる criterion として数えない。分割を問うときは、各 criterion について現時点で着手可能かを併記する。未実装の仕組みに依存する criterion が含まれる場合、分割すると現時点では着手できない issue まで起票することになる。複数 issue の起票は取り消しにくいため、自動では分割しない。分割が承認された場合は、この issue を epic として起票し、以降のフローでもその epic を対象とする。

タイトルの型は、検出した種別のままにする。`[Epic]` に変えると対応する骨格がないため、検証時に `type_mismatch` エラーとなる。

## Phase 2: 推敲

1. ${CLAUDE_SKILL_DIR}/references/prose-review.md の基準に照らして本文を直接推敲する。既存 issue の更新時は行わない
2. 会話に challenge の verdict と findings があれば、本文に反映すべき指摘だけを一度反映する。verdict と findings 自体は本文に入れない。既存 issue の更新時は行わない
3. plan 下書きがあれば、前項までの編集後の本文を ${CLAUDE_SKILL_DIR}/references/duplication-match.md の手順で照合する。照合する下書きの選択も同手順に従う。plan 下書きがなければ、この照合は省略する。既存 issue の更新時は重複箇所の検出までで止め、AskUserQuestion で承認された場合にだけ本文を編集する

## Phase 3: Plan 移設

/think の plan 下書きがある場合だけ実施する。なければ `## Plan` 節自体を設けない。Phase 2 の照合で選んだ plan 下書きを ${CLAUDE_SKILL_DIR}/scripts/pick-plan.py に渡し、出力された `plan` と `backlog` をそのまま本文へ移す。plan の書式と検証は、`/think` による書き出し時と build の Load validate で担保される。移した内容は変更しない。

## Phase 4: 起票

1. heredoc を使って `cat` で本文を一時ファイルへ書き出し、${CLAUDE_SKILL_DIR}/scripts/validate-issue-body.py <テンプレート選択で選んだ骨格ファイル> <title> <body-file> を実行する。検証エラーは ${CLAUDE_SKILL_DIR}/references/validation-errors.md に従って修正し、修正後に再実行する。既存 issue の更新時は元の骨格ファイルを特定できないため、代わりに `--content-only <body-file>` を渡す
2. Issue のプレビューを提示する。新しい内容を補わず、本文の内容をそのまま提示する。既存 issue の更新時は本文全体ではなく、変更または追加する節だけを並べる。AskUserQuestion で確認し、新規起票時は `Create this issue?`、既存 issue の更新時は `Update this issue?` と尋ねる
3. 検証に合格し、ユーザーの確認を得たら、ラベルを付けて `gh issue create --title "<title>" --body-file <path>` で起票する。出力された Issue URL を取得する。既存 issue の更新時は `gh issue edit <ref> --body-file <path>` で書き戻す
4. 下表から渡し先を選んで提案する。いずれの処理も自動実行しない

| 渡し先         | 条件                                                                  |
| -------------- | --------------------------------------------------------------------- |
| `/qualify`     | 実装へ渡す前に plan の点検をユーザーが希望したとき                    |
| `/slice`       | Phase 1 で分割が承認されたとき。起票した epic 番号を渡す              |
| `/fix <番号>`  | 1〜3 ファイルに収まる修正                                             |
| build workflow | 変更が 4 ファイル以上に及ぶ場合、または新機能の場合。issue 番号を渡す |

### 起票の制約

`<path>` には、変数ではなくリテラルの絶対パスを指定する。hook では変数が展開されず、起票に失敗するため。`priority:*` は必須とし、影響度に応じて critical、high、medium、low から選ぶ。骨格に priority の節がある場合は、その値とラベルを揃える。既存 issue の更新時も、本文の値とラベルが食い違っていれば `gh issue edit --add-label` で揃える。それ以外のラベルはリポジトリの慣例に合わせる。
