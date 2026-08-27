---
name: think
description: critic-design による敵対的批判を伴う設計探索。生き残った案を構造化 plan にまとめ、自己点検して呼び出し元に返す。plan の永続先は issue の Plan 節が唯一。計画意図のないコードベース調査には使わない (代わりに /research)。
when_to_use: 計画して, 設計して, アプローチ検討, 方針決め, planning, design exploration
allowed-tools: Read Write LS Agent AskUserQuestion Bash(${CLAUDE_SKILL_DIR}/../research/scripts/*) Bash(${CLAUDE_SKILL_DIR}/../scribe/scripts/*) Bash(ugrep:*) Bash(bfs:*) Bash(test:*) Bash(git cat-file:*) Bash(git show:*) Bash(git rev-parse:*)
model: opus
argument-hint: "[task description]"
---

# /think - 設計探索

2 つ以上の案を `critic-design` の批判にかけ、生き残った案だけを構造化 plan にまとめる。plan は templates/plan.md の骨格で下書きファイルに書き出し、会話でも返す。永続化は `/issue` が issue の Plan 節へ移設して行う。

## 入力

`$ARGUMENTS` でタスク説明と調査の文脈を受け取る。空なら AskUserQuestion でユーザーに確認する。先頭行をタスクのタイトルとして扱う。

## Phase 1: Why の確立

`.claude/OUTCOME.md` を読む。存在しない場合は `/outcome` で生成する。Why は 3 点で構成し、タスクが Bug のときは 4 点目として原因を足す。誰が何に困っているか、何を成功とみなすか、なぜ今やるか、Bug なら原因は何か。困りごとには根拠を添える。原因は再現手順やログなど根拠とともに特定し、原因が未確定なら設計へ進まず `/research` に回す。戻ってきた調査レポートに `仮説ログ` 節があれば、それを原因の根拠として読む。設計はこの Why が $ARGUMENTS と会話から読めてから始める。曖昧なまま仮置きせず、AskUserQuestion で詰める。

## Phase 2: 設計探索

案は、実在するコードと既存の調査に照らしてから作る。手順 1 から 4 は、案が 1 つも無い状態で終える。

1. 関連コードを読む。タスク、issue、調査レポートのいずれかがモック画像を参照しているなら、その画像も Read で開く。テキスト側に記載が無いことを、その要素が存在しない根拠にしない
2. タスクの語から小文字ハイフン区切りの slug を作る。${CLAUDE_SKILL_DIR}/../research/scripts/find-prior-research.py <slug> .claude/workspace/research を実行する。標準出力の候補から該当するレポートを読み、各箇所を ${CLAUDE_SKILL_DIR}/references/research-report-intake.md の表のとおり扱う。候補が 0 件なら調査レポートは無いものとして進む
3. reference_module の候補を探す。対象は画面の組か layer の組が一致する既存モジュールで、ドメインは問わない。もっとも近い 1 つを選び、他は名前を控える。結果は kind (module/no-module/new-shape) と理由で控える。一致が無ければ新規である理由を控える
4. `python3 ${CLAUDE_SKILL_DIR}/../scribe/scripts/find_wiki_rule.py docs/wiki <slug> <触りそうなパス> --scene plan` を実行し、`matched` と `scenes` のページを読む。決まりごとは unit の切り方と files の選び方を決めるので、分割の後に読むと割り直しになる
5. 異なる視点 (動く最小解/構造と拡張性/開発体験) から 2 つ以上の案を生成する。独立した技術判断は 1 つの質問に束ねず、推奨とトレードオフを添えて別々に問う
6. 案に `critic-design` を起動する。プロンプトにタスクのタイトルを一字一句そのまま含め、結果は `{ verdict: "GO" | "NO-GO", weaknesses: string[], actionable: string[] }` の JSON オブジェクト 1 つで返させる
7. NO-GO は blocker をその場で解消してから進む。生き残った設計をトレードオフの根拠とともにユーザーに提示し、承認を待つ
8. 承認後、技術判断に DR が必要か問う

## Phase 3: Plan 生成

承認された設計を unit へ実装順で分解する。unit は独立して実装できる成果 1 つ分。結果は PLAN_SCHEMA 相当の JSON へ直列化する。

`{ test_command, reference_module, units: [{ id, goal, contract, files: string[], tests: [{ id, name }], seam }] }`

分解はテスト先行で行う。設計全体から受け入れテスト候補を列挙し、成果ごとにまとめる。そのまとまりが unit の単位になり、大きさもテストの数で決まる。

1. reference_module を記録する。Phase 2 手順 3 の控えをそのまま写す (§ reference_module)
2. test_command を決める (§ test_command)
3. 各 unit の goal と files を決め、contract を書く (§ contract)
4. 各 unit の前提を書く (§ preconditions)
5. id を振る。形と対象 repo ごとの規約は ${CLAUDE_SKILL_DIR}/references/id-numbering.md が定める
6. tests[].name は条件 + 期待結果の 1 行言明。この文がそのままテスト名になるので、後から言い換えない
7. 検証可能な振る舞いが無い unit (docs/設定) は tests を空配列にする
8. test_command で実行できない基準は T-NNN にしない。画面の見た目確認や外部サービスとの手動連携がこれに当たる。`### 実機確認` へ委譲する。委譲した基準には、それを引き取る機構 (test-storybook、コードレビュー) を添える
9. ドメインフィールドを描画する unit は、そのフィールドを T-NNN へ 1 件ずつ列挙する。まとめて 1 件にすると個別フィールドの欠落を検出できない
10. non-seam unit の上限は files 3 つ、tests 4 個。seam unit の tests は unit 境界を跨ぐので files が増え、この上限の対象外になる。上限を超えた unit は成果を軸に分割し、生じた新しい unit 構成をユーザーと確認する。スコープ外へ切り出した候補は plan から外し、backlog candidates に回す。この上限の正は `workflows/build.js` の `UNIT_CAPS`。変更はこの記述と `UNIT_CAPS` を同一コミットで揃える
11. tests を持つ unit が 2 つ以上なら、seam unit を 1 つだけ最後に置く。`seam: true` を付ける。unit ごとに green でも、unit どうしを繋ぐ配線は誰も通していない。seam の tests は unit 間の境界を跨いで実モジュールを動かし、その接続を assert する。ここでテストダブルへ置き換えてよいのはシステム外部との I/O に限る
12. seam unit の files には、その接続を作る非テストファイルを 1 つ以上入れる。入らないなら配線は先行 unit が作り終えているので、seam unit を置かず、境界を跨ぐ assert を配線を作る unit の tests へ入れる。その unit が上限を超えるなら成果を 2 つ持っているので、step 10 に従って分割する
13. unit が出そろったら `python3 ${CLAUDE_SKILL_DIR}/../scribe/scripts/find_wiki_rule.py docs/wiki <slug> <units[].files を並べる> --scene plan` を実行する。Phase 2 で読んだ分との差を取る。`matched` の各ページは、引用するか、この plan には当たらない理由を散文に書くかのどちらかにする。`related` は語が重なるだけなので、引くときは当たる理由を添える。`scenes` の各ページは読む
14. 自己点検を通す。見るのは必須フィールドの欠落、id の重複、そして units、files、goal、contract の空。続けて ${CLAUDE_SKILL_DIR}/references/pre-write-check.md の書き出し前検証を通す。通ったら ${CLAUDE_SKILL_DIR}/templates/plan.md の骨格で `.claude/workspace/planning/YYYY-MM-DD-<slug>.plan.md` に書き出す。slug はタイトルの小文字ハイフン区切り。`## Plan` と `## Backlog candidates` の両節を含める

### test_command

test_command の失敗は計画スコープだけに帰着できなければならない。既存負債 (リポジトリ全体の型エラー、フォーマット差分) を抱えたリポジトリではゲートを絞る。触るディレクトリだけを lint し、型チェック出力は path パターンでフィルタする。内容 grep では絞らない。リポジトリルートから実行して成立するコマンドとして書く。

### reference_module

contract が引用できるのは 1 箇所の振る舞いだけなので、周辺構造は実装者が手で組むことになる。Phase 2 手順 3 の控えを `reference_module: { kind, reason, path, files, instances, conventions }` へ記録し、探索はやり直さない。kind は module/no-module/new-shape のいずれかで、module 以外なら理由 (reason) が必須。構造は plan の参照モジュール節に書き、各 unit はそこを参照する。

1. 骨格が 4 ファイル未満に収まるときだけ、U-001 をその構造複製にする。複製するのは同じディレクトリ配置、コンポーネント名、export 名で、tests は空配列。収まらないときは layer ごとに unit を割り、各 unit が担当分を複製する
2. 維持する共有慣例 (合成する共有コンポーネント/整形を書く場所/状態の渡し方) を明記する。逸脱は plan に理由を書いたときのみ許す
3. 選ばなかった候補の名前と、kind が module でない理由を reason に書く。reason の無い kind は計画の欠陥として扱う
4. instances が 2 以上なら「N 例目」と散文に書き、実装者へ設計でなく複製を指示する

### preconditions

書くのは既存の依存先のみ。形式はリポジトリルート起点の path 単独か、path + stable anchor の 2 つ。anchor は `ugrep -F` が固定文字列として一致する公開シンボル名 1 つに限る。private な実装詳細、コメント文字列、行番号は使わない。安定したシンボルが無ければ path のみの行にする。unit が新しく作るファイルは載せない。

### contract

生成でなく選択で書く。散文で振る舞いを描いたりコード片を新造したりせず、contract は引用 + やりたいこと 1 行のセットにする。

複数の unit に掛かる決まりごとは contract でなく `### 決まりごと` へ書く。引用できる出典が無い新規の形は signature を発明しない。形の決定は実装に委ね、受け入れテストが振る舞いを固定する。モックや設計資料が UI 文言を逐語で持つなら、出典のパスを添えてそのまま写す。対象はラベル、placeholder、ボタン名、選択肢名。

引用元は下表の上から順に探し、最初に見つかったものを採る。外部ライブラリは SOURCING.md に従う。

| 引用元                                     | 写し方                                                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| コードベースの既存の形                     | path + 公開シンボル。stable anchor の規則は前提と同じ。引用した path とシンボルは `### 前提` にも載せる                                         |
| docs/wiki の共通項ページ                   | 該当する定型手順の行を逐語で写す。当たる行が無ければ `内容` の一文を写す。ページに公開シンボルは無いので、`### 前提` には path 単独の行で載せる |
| docs/wiki の構造ページ (`kind: structure`) | `境界` / `契約` / `要求` の該当行を逐語で写す。`内容` の一文へ落とさない。`### 前提` へは同じく path 単独の行で載せる                           |
| 公式 docs                                  | pinned version への deep link                                                                                                                   |

## 出力

以下を会話で呼び出し元に返す。

| 項目               | 内容                                                    |
| ------------------ | ------------------------------------------------------- |
| ready              | 自己点検を通過し、blockers が 0 件のとき true           |
| plan               | 自己点検済みの構造化 plan                               |
| plan file          | 書き出した `.plan.md` のパス                            |
| blockers           | 残った論点のうち、ユーザーが決めないと進めないもの      |
| backlog candidates | スコープ外へ切り出した候補。無ければ「なし」            |
| 設計要約           | 採用した案、比較した案、`critic-design` の判定、DR 要否 |
