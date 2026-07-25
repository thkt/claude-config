---
name: think
description: critic-design による敵対的批判を伴う設計探索。生き残った案を構造化 plan にまとめ、自己点検して呼び出し元に返す。plan の永続先は issue の Plan 節が唯一。計画意図のないコードベース調査には使わない (代わりに /research)。
when_to_use: 計画して, 設計して, アプローチ検討, 方針決め, planning, design exploration
allowed-tools: Read Write LS Task AskUserQuestion Bash(ugrep:*) Bash(bfs:*) Bash(test:*) Bash(git cat-file:*) Bash(git show:*) Bash(git rev-parse:*)
model: opus
argument-hint: "[task description]"
---

# /think - 設計探索

2 つ以上の案を `critic-design` の批判にかけ、生き残った案だけを構造化 plan に到達させる。plan は templates/plan.md の骨格で下書きファイルに書き出し、会話でも返す。永続化は `/issue` が issue の Plan 節へ移設して行う。

## 入力

`$ARGUMENTS` でタスク説明と調査の文脈を受け取る。空なら AskUserQuestion でユーザーに確認する。先頭行がタスクのタイトル。

## Phase 1: Why の確立

`.claude/OUTCOME.md` を読む。存在しない場合は `/outcome` で生成する。誰がどんな痛みで必要とし (根拠付き)、何が成功で、なぜ今やるのか。設計はこの Why が $ARGUMENTS と会話から読めてから始める。曖昧なまま仮置きせず、AskUserQuestion で詰める。

## Phase 2: 設計探索

案は現実のコードと既存の調査に接地させる。関連コードを読み、`.claude/workspace/research/` にタスクに該当する調査出力があれば読む。調査レポートで次のアクションが「記録のみ」の発見は背景知識として扱い、plan のスコープに入れない。異なる視点 (動く最小解 / 構造と拡張性 / 開発体験) から 2 つ以上の案を生成する。独立した技術判断は 1 つの質問に束ねず、推奨とトレードオフを添えて別々に問う。

1. 案に `critic-design` を起動する。プロンプトにタスクのタイトルを一字一句そのまま含め、結果は `{ verdict: "GO" | "NO-GO", weaknesses: string[], actionable: string[] }` の JSON オブジェクト 1 つで返させる
2. NO-GO は blocker をその場で解消してから進む。生き残った設計をトレードオフの根拠とともにユーザーに提示し、承認を待つ
3. 承認後、技術判断に DR が必要か問う

## Phase 3: Plan 生成

承認された設計を、独立して実装可能な成果の束 (unit) に実装順で分解し、PLAN_SCHEMA 相当の JSON `{ test_command, reference_module, units: [{ id, goal, contract, files: string[], tests: [{ id, name }], seam }] }` に直列化する。分解はテスト先行で構成し、unit の大きさはテストの束から機械的に決める。設計全体から受け入れテスト候補を列挙し、成果のまとまりごとに 4 個以下の束へ分け、各束が触るファイルを割り当てて unit にする。割り当てが 4 ファイル以上になった束はさらに分ける。検証可能な振る舞いの無い成果 (docs / 設定) は tests 空の unit として別途足す。

1. id は U-001 / T-001 形式の連番で、T-NNN は plan 全体で一意にする
2. tests[].name は条件 + 期待結果の 1 行言明。code workflow がテスト名として逐語使用し、build が固定文字列で照合する
3. 検証可能な振る舞いが無い unit (docs / 設定) は tests を空配列にする。build はその unit を直接実装で扱う
4. 各 unit のテストは自分の境界を stub するので、tests を持つ unit が 2 つ以上になったら seam unit をちょうど 1 つ最後に置き `seam: true` を付ける。その tests は unit 間の境界を跨いで実モジュールを動かし、偽装はシステム外部との I/O に限り、unit どうしをつなぐ接続を assert する。seam unit が無い plan は build の `validate()` が reject する
5. unit の上限は files 3 つ、tests 4 個。上限を超えた unit は成果を軸に分割し、分割で生じた新しい unit 構成をユーザーと確認する。スコープ外へ切り出した候補は plan に入れず backlog candidates に回す。この上限は `workflows/build.js` の `UNIT_CAPS` として決定論的に強制される。変更はこの記述と `UNIT_CAPS` を同一コミットで揃える
6. 自己点検 (必須フィールドの欠落、id の重複、空の units / tests / goal / contract) と書き出し前検証を通し、`${CLAUDE_SKILL_DIR}/templates/plan.md` の骨格で `.claude/workspace/planning/YYYY-MM-DD-<slug>.plan.md` に書き出す。slug はタイトルの小文字ハイフン区切り。`## Plan` と `## Backlog candidates` の両節を含める

### reference_module

contract の引用は 1 箇所の振る舞いで、周辺構造の手組みは止められない。計画対象と同じ形 (ドメイン不問で、画面の組か layer の組が一致) の既存モジュールを探し、`reference_module: { path, files, instances }` に記録する。構造を運ぶのは `reference_module` セクション自体で、全 unit がそこを参照する。骨格が 4 ファイル未満に収まるときだけ U-001 をその構造複製 (同じディレクトリ配置・コンポーネント名・export 名、tests は空配列) にし、収まらないときは layer ごとに unit を割って各 unit が担当分を複製する。維持する共有慣例 (合成する共有コンポーネント、フォーマット処理の置き場所、状態の渡し方) を明記し、逸脱は plan に理由を書いたときのみ許す。候補が複数なら画面の組がもっとも近いものを選び、他は prose に名前を挙げる。一致が無ければ null とし、この形が新規である理由を prose に書く (理由の無い null は planning の欠陥)。instances が 2 以上なら「N 例目」と prose に書き、実装者へ設計でなく複製を指示する。

### contract

生成でなく選択で書く。prose で振る舞いを素描したりコード片を新造したりせず、contract は引用 + やりたいこと 1 行のセットにする。引用は、コードベースの既存の形 (path + 公開シンボル、前提と同じ stable anchor 規則) > docs/wiki のページ > pinned version の公式 docs への deep link の優先順で選び、外部ライブラリは SOURCING.md に従う。引用できる出典が無い新規の形は signature を発明せず、形の決定は実装に委ねて受け入れテストが振る舞いを固定する。引用した path + シンボルは `### 前提` にも載せる。

### 前提 (preconditions)

既存の依存先のみを、リポジトリルート起点の path 単独か path + stable anchor の 2 形式で書く。anchor は `ugrep -F` が固定文字列として一致する公開シンボル名 1 つに限り、private な実装詳細・コメント文字列・行番号は使わない。安定したシンボルが無ければ path のみの行にする。unit が作る新規作成ファイルは載せない。

### test_command

test_command の失敗は計画スコープだけに帰着できなければならない。既存負債 (リポジトリ全体の型エラー、フォーマット差分) のあるリポジトリでは、触るディレクトリだけを lint し、型チェック出力を path パターンでフィルタする形でゲートを絞る。内容 grep では絞らない。

### base

`base:` には plan を実装するブランチ (PR のベースブランチ) を書く。タスク説明か会話から読み取り、指定が無ければ現在の checkout のブランチを書く。

### 書き出し前検証

build workflow の Revalidate と同じリポジトリルートで検証し、失敗した行は修正するか落とす。`base:` が現在の checkout と異なるブランチを指すときは、ファイルの実在を `test -f <path>` の代わりに `git cat-file -e <base>:<path>` で、anchor を `git show <base>:<path> | ugrep -F '<pattern>'` で検証する。

1. `### 前提` の各行。path は `test -f <path>`、anchor は `ugrep -F '<pattern>' <path>` (base が異なるときは上記の base ブランチ形式)
2. `units[].files` と `reference_module.files` のうち既存ファイルを指す行を `test -f <path>` で確認 (同じく base ブランチ形式に置き換え)
3. 既存ファイルを触る unit があるのに `### 前提` が空 / 不在なら失敗。要となる依存を anchor する行を足す
4. `reference_module: null` は理由の明記が prose に無ければ失敗
5. templates/plan.md の行数規則の超過が無いこと
6. 各 unit の `files` と T-NNN の個数を数え、files 4 つ以上または tests 5 個以上の unit が無いこと。あれば分割してから再検証する
7. test_command をリポジトリルートで 1 回実行する。plan より前から在る原因 (script 不在、リポジトリ全体の負債) で失敗したら、`### test_command` に従ってコマンドを絞り直し、絞った理由を plan の prose に書く

## 出力

以下を会話で呼び出し元に返す。

| 項目               | 内容                                                    |
| ------------------ | ------------------------------------------------------- |
| ready              | plan が自己点検を通過し、かつ未決着の論点なしで true    |
| plan               | 自己点検済みの構造化 plan                               |
| plan file          | 書き出した `.plan.md` のパス                            |
| blockers           | ready = false の原因のうちユーザー判断が要る論点        |
| backlog candidates | スコープ外へ切り出した候補。無ければ「なし」            |
| 設計要約           | 採用した案、比較した案、`critic-design` の判定、DR 要否 |
