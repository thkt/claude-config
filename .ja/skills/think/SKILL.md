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

`.claude/OUTCOME.md` を読む。存在しない場合は `/outcome` で生成する。Why は 3 点で構成し、タスクが Bug のときは 4 点目として原因を足す。誰がどんな痛みを抱えて必要としているか、何を成功とみなすか、なぜ今やるか、Bug なら原因は何か。痛みには根拠を添える。原因は再現手順やログなど根拠とともに特定し、原因が未確定なら設計へ進まず `/research` に回す。戻ってきた調査レポートに `仮説ログ` 節があれば、それを原因の根拠として読む。設計はこの Why が $ARGUMENTS と会話から読めてから始める。曖昧なまま仮置きせず、AskUserQuestion で詰める。

## Phase 2: 設計探索

案を現実のコードと既存の調査に接地させてから作る。手順 1 から 4 が接地の材料を集める工程で、案が 1 つも無い状態で終える。

1. 関連コードを読む。タスク、issue、調査レポートのいずれかがモック画像やスクリーンショットを参照しているなら、その画像ファイルも Read で開く。テキスト側に記載が無いことを、その要素が存在しない根拠にしない
2. タスクの語から小文字ハイフン区切りの slug を作り、${CLAUDE_SKILL_DIR}/../research/scripts/find-prior-research.py <slug> .claude/workspace/research を実行する。標準出力の候補から該当するレポートを読み、各箇所を ${CLAUDE_SKILL_DIR}/references/research-report-intake.md の表のとおり扱う。候補が 0 件なら調査レポートは無いものとして進む
3. ドメインを問わず画面の組か layer の組が一致する既存モジュールを reference_module 候補として探索し、kind (module/no-module/new-shape) と理由で控える
4. `python3 ${CLAUDE_SKILL_DIR}/../scribe/scripts/find_wiki_rule.py docs/wiki <slug> <触りそうなパス>` を実行し、`matched` のページを読む。決まりごとは unit の切り方と files の選び方に効くので、分割の後に読むと割り直しになる
5. 異なる視点 (動く最小解/構造と拡張性/開発体験) から 2 つ以上の案を生成する。独立した技術判断は 1 つの質問に束ねず、推奨とトレードオフを添えて別々に問う
6. 案に `critic-design` を起動する。プロンプトにタスクのタイトルを一字一句そのまま含め、結果は `{ verdict: "GO" | "NO-GO", weaknesses: string[], actionable: string[] }` の JSON オブジェクト 1 つで返させる
7. NO-GO は blocker をその場で解消してから進む。生き残った設計をトレードオフの根拠とともにユーザーに提示し、承認を待つ
8. 承認後、技術判断に DR が必要か問う

## Phase 3: Plan 生成

承認された設計を、独立して実装可能な成果の束 (unit) に実装順で分解する。分解の結果は PLAN_SCHEMA 相当の JSON `{ test_command, reference_module, units: [{ id, goal, contract, files: string[], tests: [{ id, name }], seam }] }` に直列化する。分解はテスト先行で構成し、unit の大きさはテストの束から機械的に決める。設計全体から受け入れテスト候補を列挙し、成果のまとまりごとの束へ分け、各束が触るファイルを割り当てて unit にする。束の大きさは non-seam unit の上限に収め、超える束はさらに分ける。検証可能な振る舞いの無い成果 (docs/設定) からは受け入れテスト候補が出ないので、束とは別に unit を立てる。

1. id は U-001/T-001 形式の連番で振り、T-NNN は plan 全体で一意にする
2. 対象 repo のテストが接頭辞つきの id を使っているなら、T-SK077 のようにその規約へ合わせ、同じ接頭辞の repo 全体での最大番号の次から振る。plan だけ接頭辞なしにすると、実装時の改番に頼ることになる
3. 接頭辞なしの repo では、plan 全体の一意性が同じファイル内までは届かない。テストを書き込むファイルで既に使われている番号を避けて振る
4. tests[].name は条件 + 期待結果の 1 行言明。code workflow がテスト名として逐語使用し、build が固定文字列で照合する
5. 検証可能な振る舞いが無い unit (docs/設定) は tests を空配列にする。build はその unit を Red-Green ではなく直接実装の 1 ステップとして進める
6. 受け入れテスト候補のうち test_command で実行できない基準 (画面の見た目確認、外部サービスとの手動連携など) は T-NNN にせず、`### 実機確認` へ委譲する。委譲した基準には、それを引き取る機構 (test-storybook、コードレビューなど) を添える
7. ドメインフィールドを描画する unit は、表示するフィールドを T-NNN に 1 フィールド 1 件で列挙する。まとめて 1 件にすると個別フィールドの欠落を検出できない
8. tests を持つ unit が 2 つ以上になったら seam unit をちょうど 1 つ最後に置き `seam: true` を付ける。unit ごとに green でも、unit どうしを繋ぐ配線は誰も通していない。seam の tests は unit 間の境界を跨いで実モジュールを動かし、その接続を assert する。ここでテストダブルへ置き換えてよいのはシステム外部との I/O に限る。seam unit が無い plan は build の `validate()` が reject する
9. non-seam unit の上限は files 3 つ、tests 4 個。seam unit の tests は unit 境界を跨ぐので files が増え、この上限の対象外になる。上限を超えた unit は成果を軸に分割し、生じた新しい unit 構成をユーザーと確認する。スコープ外へ切り出した候補は plan から外し、backlog candidates に回す。この上限は seam の除外も含めて `workflows/build.js` の `UNIT_CAPS` が決定論的に強制する。変更はこの記述と `UNIT_CAPS` を同一コミットで揃える
10. unit が出そろったら `python3 ${CLAUDE_SKILL_DIR}/../scribe/scripts/find_wiki_rule.py docs/wiki <slug> <units[].files を並べる>` を実行し、Phase 2 で読んだ分との差を取る。`matched` の各ページは、引用するか、この plan には当たらない理由を prose に書くかのどちらかにする。`related` は語が重なるだけなので、引くときは当たる理由を添える
11. 自己点検 (必須フィールドの欠落、id の重複、units、files、goal、contract のいずれかが空) を通し、${CLAUDE_SKILL_DIR}/references/pre-write-check.md の書き出し前検証を通す。通ったら ${CLAUDE_SKILL_DIR}/templates/plan.md の骨格で `.claude/workspace/planning/YYYY-MM-DD-<slug>.plan.md` に書き出す。slug はタイトルの小文字ハイフン区切り。`## Plan` と `## Backlog candidates` の両節を含める

### test_command

test_command の失敗は計画スコープだけに帰着できなければならない。リポジトリ全体の型エラーやフォーマット差分といった既存負債を抱えたリポジトリでは、触るディレクトリだけを lint し、型チェック出力を path パターンでフィルタしてゲートを絞る。内容 grep では絞らない。build の Revalidate も code の verify もリポジトリルートから走るので、ルートから実行して成立するコマンドとして書く。

### reference_module

contract が引用できるのは 1 箇所の振る舞いだけで、周辺構造の手組みは止まらない。候補は Phase 2 で探索済みなので、ここでは結果を `reference_module: { path, files, instances }` に記録するだけにし、やり直さない。構造は `reference_module` セクションに書き、各 unit はそこを参照する。

1. 骨格が 4 ファイル未満に収まるときだけ U-001 をその構造複製 (同じディレクトリ配置/コンポーネント名/export 名。tests は空配列) にする。収まらないときは layer ごとに unit を割り、各 unit が担当分を複製する
2. 維持する共有慣例 (合成する共有コンポーネント/フォーマット処理の置き場所/状態の渡し方) を明記する。逸脱は plan に理由を書いたときのみ許す
3. 候補が複数なら画面の組がもっとも近いものを選び、他は prose に名前を挙げる
4. 一致が無ければ null とし、この形が新規である理由を prose に書く。理由の無い null は planning の欠陥として扱う
5. instances が 2 以上なら「N 例目」と prose に書き、実装者へ設計でなく複製を指示する

### 前提 (preconditions)

既存の依存先のみを、リポジトリルート起点の path 単独か path + stable anchor の 2 形式で書く。anchor は `ugrep -F` が固定文字列として一致する公開シンボル名 1 つに限り、private な実装詳細/コメント文字列/行番号は使わない。安定したシンボルが無ければ path のみの行にする。unit が新しく作るファイルは載せない。

### contract

生成でなく選択で書く。prose で振る舞いを素描したりコード片を新造したりせず、contract は引用 + やりたいこと 1 行のセットにする。引用は、コードベースの既存の形 (path + 公開シンボル、前提と同じ stable anchor 規則) > docs/wiki のページ > pinned version の公式 docs への deep link の優先順で選び、外部ライブラリは SOURCING.md に従う。docs/wiki を引く場合は、該当する定型手順の行を逐語で写す。定型手順に当たる行が無く `内容` の一文が該当するなら、そちらを逐語で写す。ページには公開シンボルが無いので、`### 前提` には path 単独の行で載せる。unit を跨いで効く決まりごとは contract でなく `### 決まりごと` へ書く。引用できる出典が無い新規の形は signature を発明せず、形の決定は実装に委ねて受け入れテストが振る舞いを固定する。引用した path + シンボルは `### 前提` にも載せる。

モックや設計資料が UI 文言 (ラベル、placeholder、ボタン名、選択肢名) を逐語で持つなら、出典のパスを添えて contract にそのまま写す。

## 出力

以下を会話で呼び出し元に返す。

| 項目               | 内容                                                    |
| ------------------ | ------------------------------------------------------- |
| ready              | plan が自己点検を通過し、未決着の論点が無いとき true    |
| plan               | 自己点検済みの構造化 plan                               |
| plan file          | 書き出した `.plan.md` のパス                            |
| base               | 既定と違う実装先を選んだときだけ書く。epic ブランチへ集約する場合など。既定でよければ「なし」と書き、build の引数にも入れない |
| blockers           | ready = false の原因のうちユーザー判断が要る論点        |
| backlog candidates | スコープ外へ切り出した候補。無ければ「なし」            |
| 設計要約           | 採用した案、比較した案、`critic-design` の判定、DR 要否 |
