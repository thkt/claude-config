---
name: issue
description: 構造化されたタイトルと本文で GitHub Issue を生成する。単独で成立し、前段を要求しない。challenge / research の成果物が会話にあれば本文の根拠に使い、/think の plan 下書きがあれば `## Plan` 節へ移設する。issue 番号を渡すと、起票済みで Plan 節を持たない issue へ plan を転記する。
when_to_use: Issue作って, Issue書いて, Issue作成, GitHub Issue, buildに渡す準備, Plan転記
allowed-tools: Bash(gh:*) Bash(cat:*) Bash(ugrep:*) Read AskUserQuestion
model: opus
argument-hint: "[issue description | issue number]"
---

# /issue - GitHub Issue 生成

単独で成立する起票スキル。会話コンテキストに `/challenge`/`/research`/`/think` の成果物があれば、`/challenge` の verdict は起票判断に、`/research` の発見は本文の根拠に使い、`/think` の plan 下書きは `## Plan` 節へ移設する。どの段を通すかは人間が決める。

## 入力

`$ARGUMENTS` は Issue 説明。空なら AskUserQuestion で説明を尋ねる。

issue 番号か URL だけを受け取ったときは、起票済み issue へ plan を転記する。`gh issue view <ref> --json title,body` で取った本文を起草済みとみなして Phase 2 から始め、Phase 4 の起票を `gh issue edit <ref> --body-file <path>` に置き換える。plan 下書きが無ければ `/think` の実行を提案して止まり、`## Plan` を既に持つ issue は `/qualify` の検分に回す。

## 言語

`~/.claude/settings.json` から `language` を読み、その言語で Issue 本文とテンプレートを翻訳する。未設定なら英語をデフォルトとする。英語のまま残すのは識別子/コード/コマンド/固有名だけで、設定言語に平易な同義語がある英単語を地の文に混ぜない。テンプレート由来の見出しと Plan 節の抽出キーワードは英語のまま維持する。

## Phase 1: 起草

1. `.claude/OUTCOME.md` があれば読み、issue が outcome に資するか確認する
2. 説明から種別を検出する
3. feature か bug で、Why が説明から読み取れない場合、壁打ちで詰める
4. テンプレートを選び、タイトルと本文を生成し、確定/仮を確信度マーキングの基準でマークする
5. epic 規模で分割すべきか判定する

### 種別判定

判別不能な場合は `feature` をデフォルトとする。タイトルには種別をキャピタライズして角括弧で囲ったプレフィックスを付ける。

| 種別    | 用途                                     |
| ------- | ---------------------------------------- |
| bug     | 既存のものが壊れているか期待通り動かない |
| feature | 新しい能力や拡張要望                     |
| docs    | ドキュメント追加や訂正                   |
| chore   | メンテナンス、設定、依存更新             |

### 軽微 bug の導線

ここで決めるのは起票するかどうか。次の 3 基準をすべて満たす bug は軽微で、起票せず `/fix` で直接対応する選択肢がある。起票する場合も、本文フッターに「軽微につき `/fix` で対応してもよい」と注記する。原因未特定の間欠 bug は該当しない。

| 基準     | 内容                         |
| -------- | ---------------------------- |
| 変更範囲 | 1 ファイルに収まる           |
| 再現     | 再現手順が確定している       |
| 調査     | コードベースの横断調査が不要 |

### Why 壁打ち

issue の Why を、本文起草の前に確立する。1 メッセージにつき 1 質問し、期待する答えを仮説として推奨回答に添える。コードベースで解決できる疑問は、問う前に Read や ugrep で探索する。次の 3 点が説明から読み取れるか、次に問う質問の答えを予測できるようになったら、質問をやめて起草に進む。

| 質問                                   | 本文での置き場      |
| -------------------------------------- | ------------------- |
| 誰がこれを必要としているか             | What & Why          |
| どんな痛みが存在し、その根拠は何か     | What & Why          |
| 計測可能な結果として何を成功とみなすか | Acceptance Criteria |

### テンプレート選択

`gh api "repos/{owner}/{repo}/contents/.github/ISSUE_TEMPLATE" --jq '.[].name'` で列挙し、種別に対応するものを次の順で骨格に取る。`<type>.yml` (issue form) > `<type>.md` > skill ディレクトリ直下の `templates/<type>.md`。リポジトリ自身のテンプレートを先に取るのは、Web UI からの起票がそれを使うため。CLI 起票がそれを無視すると、同じ種別の issue が 1 つの tracker に 2 通りの形で並ぶ。

`.yml` は各 `body` 要素の `attributes.label` が骨格の節名になり、`validations.required` が真のものだけが必須になる。form は Web UI が埋めさせる最小要件なので、CLI 起票がそこへ節を足すのは逸脱ではない。`.md` は先頭 frontmatter の `name`/`about`/`labels`/`title` を外して骨格にする。

### 確信度マーキング

ユーザーが決めた要件は無印。ユーザーが未決定のまま残した判断と未検証の事実だけに `(tentative: <着手時のアクション>)` をインラインで付ける。不確かな HOW は書かない。

| 論点               | 内容                                                                           |
| ------------------ | ------------------------------------------------------------------------------ |
| マーカーの言語     | 本文言語を問わず `tentative` のまま書く。build の抽出キーワードのため          |
| issue レベルの前提 | Premises 節を持つ feature と bug はそこへ置き、chore と docs はインラインだけ  |
| 下流での扱い       | build が assumptions として抽出し、draft PR でユーザーが覆せる veto 対象になる |

### 分割判定

独立して実装可能な criteria が 2 つ以上あれば、AskUserQuestion で分割を問う。選択肢は「1 issue のまま」か「epic と子 issue に分割」。1 つの成果物を検証するだけの細かいチェックは数えず、1 issue 内に留める。N 件の起票は取り消しにくいため、自動分割はしない。承認時はこの issue を epic として起票し、以降のフローはそのまま epic に通す。

## Phase 2: 推敲

1. `${CLAUDE_SKILL_DIR}/references/prose-review.md` と、本文言語に対応する空句ファイルの基準で本文をインライン精査する。空句ファイルは日本語なら `phrases.ja.md`、英語なら `phrases.en.md`。Phase 3 で移設する Plan 節は対象外とし、手を入れない
2. 会話に challenge の verdict と findings があれば、本文に折り込むべき指摘だけ 1 回反映する。verdict と findings 自体は本文に入れない
3. plan 下書きがあれば、前項までの編集を終えた本文を、選んだ plan 下書き 1 つと「重複の照合」の手順で照合する。会話に `/think` のものがあればそれを、無ければ `.claude/workspace/planning/` の該当ファイルを選ぶ。plan 下書きが無ければ、この照合を省く

### 重複の照合

本文と `## Plan` で同じ知識が重なる箇所すべてを対象にする。同じ知識かどうかは、片方を直すともう片方も直る関係かで判定し、独立に変わりうるものは両方に残す。重複した本文側は `## Plan` への参照に置き換える。置き換えたあとも、その見出しが何をする変更かを述べる 1 行、却下理由と根拠の file:line、痛みの記述は本文に残す。参照は本文から `## Plan` へ向ける。plan は `/think` が本文より先に独立したファイルへ書き出し、本文の節はそのあとに生まれる。食い違うときは plan を正として本文を直す。Acceptance Criteria も Outcome と重なるが、人間のマージ判断に使い build に届かないので本文に残す。

| 本文の節          | Plan 側の対応    |
| ----------------- | ---------------- |
| Approach          | unit の contract |
| Testing Decisions | T-NNN            |
| Premises          | 前提             |
| Scope の In scope | files            |

## Phase 3: Plan 移設

/think の plan 下書きがあるときだけ実施し、無ければ節ごと省略する。`.claude/workspace/planning/` から issue のタイトルに一致する最新の `*.plan.md` を Read し、`## Plan` と `## Backlog candidates` の両節をそのまま本文へ移設する。書式と検証は `/think` の書き出し時と build の Load validate が担い、移設した内容には手を入れない。

## Phase 4: 起票

1. Issue プレビューを提示する。インライン仮マークがあれば仮ブロックに集約する。新規内容は足さず本文が持つものを写し、0 件なら省略する。最後に AskUserQuestion で `Create this issue?` と確認する。`## Plan` 節が無く build workflow に渡す規模なら、選択肢に「起票を保留して `/think` で plan を作る」を足す
2. 本文を一時ファイルに書き出す。`${CLAUDE_SKILL_DIR}/scripts/validate-issue-body.py ${CLAUDE_SKILL_DIR}/templates/<type>.md <title> <body-file>` を実行し、エラーは後述の Error Handling に従って対処する。exit 0 になったらラベルを付けて `gh issue create --title "<title>" --body-file <path>` で起票する。出力から Issue URL を取得する
3. Phase 1 で分割を承認していれば、起票した epic 番号を添えて `/slice` の実行を提案する。自動では起動しない
4. 分割しない issue には次の手を提案する。起票済み issue の渡し先は影響範囲で決め、1〜3 ファイルに収まる修正なら `/fix <番号>`、4 ファイル以上または新機能なら build workflow に番号を渡す。build workflow に渡す issue が Plan 節を持たないなら、`/think` で plan を作り `/issue <番号>` で転記してから渡し、渡す前の検分には `/qualify` を使う。いずれも自動では起動しない

### ラベル

`priority:*` は必須とし、影響度に応じて critical、high、medium、low のいずれかを付ける。それ以外のラベルは、リポジトリの慣例に合わせる。

## Error Handling

`${CLAUDE_SKILL_DIR}/scripts/validate-issue-body.py` は `{errors, warnings, checks}` を JSON で標準出力に返し、`errors` が 1 件以上あれば exit 1 で終わる。既存 issue へ plan を転記する `/issue <番号>` の経路は Phase 4 の起票を `gh issue edit` に置き換えるため、この検査は対象外。エラーは下表に従って対処する。

| エラー                   | 対処                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `missing_section:<name>` | テンプレート骨格から落ちた見出しを戻し、再検証する                                                                   |
| `type_mismatch:*`        | タイトルの角括弧の型を正とし、それに合うテンプレートを選び直して本文を書き直す。タイトルの書き換えによる解消はしない |
