---
name: research
description: プロジェクトと技術的な質問を調査する。発見事項は結論ではなく、明示的なソース付きで反証にさらすべき主張として扱う。Phase 6 では統合が確定する前に advisor がそれへ反論する。設計計画や plan 生成には使わない (代わりに /think を使う)。
when_to_use: 調査して, 調べて, リサーチ, investigate, 分析して, issueやろう, issue見て, 横並びチェック, 類似パターン検出, refactor 横展開
allowed-tools: Bash(tree:*) Bash(git log:*) Bash(git diff:*) Bash(git show:*) Bash(wc:*) Bash(scout:*) Read LS Task AskUserQuestion Bash(ugrep:*) Bash(bfs:*) Bash(codegraph:*) Bash(node:*) WebFetch WebSearch
model: opus
context: fork
background: false
argument-hint: "[research subject or question]"
---

# /research - プロジェクト / 技術調査

コードベースを調査し、発見事項をソース付きで記録する。実装は伴わない。

## 入力

調査対象は `$ARGUMENTS` で受け取る。自由記述のトピックまたは質問。空なら AskUserQuestion でユーザーに確認する。

## Phase 1: アウトカム参照

`.claude/OUTCOME.md` を読む。存在しない場合は `/outcome` で stub を生成する。調査が Non-goals に踏み込む場合は、進める前にユーザーに確認する。

## Phase 2: 過去調査スキャン

`$ARGUMENTS` から小文字ハイフン区切りの slug を作り、`bfs .claude/workspace/research -name '*<slug>*.md'` で過去の調査ファイルを探す。見つからなければ「No prior research found for `<slug>`」と注記して先へ進む。見つかった各ファイルは下表のとおり引き継ぐ。

| 抽出元               | 引き継ぎ先 | 扱い                                 |
| -------------------- | ---------- | ------------------------------------ |
| Key Findings 表      | Phase 7    | ベースラインとして再検証または上書き |
| Constraints 表       | Phase 4    | 入力として使い再発見しない           |
| Disconfirmation 結果 | Phase 7    | 参照する                             |

## Phase 3: 意図とドメインの明確化

`$ARGUMENTS` で意図とドメインの両方が明確なら省略する。そうでなければ AskUserQuestion で、意図は Feature planning / Bug investigation / Understanding から、ドメインは Data model / API / Infrastructure / General から選ばせる。ドメインは Phase 4 のスコープを決め、General はスコープなし。

## Phase 4: ドメインスコープ並列調査

Explore / ugrep / bfs / Read を並列起動する。発見事項にはその場でソースを書く。事実は `file:line`、推論は `inferred from X`、未検証は `unknown, requires X`。各コマンドと生出力は scratch にそのまま追記する。これが監査証跡で、Phase 7 の Disconfirmation はここから直接引用し再構築しない。

意図が Feature planning または Bug investigation なら `Task(subagent_type: explorer-feature, run_in_background: false)` も起動し、実行経路を把握する。Feature planning は将来経路を、Bug investigation は該当バグの実行経路を追う。spawn prompt には調査対象のタイトルをそのまま含め、結果は `{ findings: [{ statement: string, source: string }] }` の JSON 1 object で返させる。空が返ったらキーワードを広げて再実行する。

`.codegraph/` index があるときは `codegraph sync` で更新し、誰が呼ぶ・何が壊れる・どのテストに波及する、といった構造質問は codegraph で先に解決する。呼び出し元は `codegraph callers <symbol>`、影響範囲と波及テストは `codegraph impact <symbol>` で読み、出力を finding のソースに引用する。同じ質問への ugrep / grep の symbol 名検索はソースに認めない。index が無い repo では無断で init せず Explore / ugrep にフォールバックし、ugrep / grep は自由記述の内容検索に限って使う。

ドメインは下表でスコープする。Explore にはプロンプトでルートを渡し、ugrep / bfs には語を追加し、Read はルートを起点にする。対象ドメインの glob ルートが全て不在なら General にフォールバックする。

| ドメイン       | glob ルート                                                     | ドメインに沿った語              |
| -------------- | --------------------------------------------------------------- | ------------------------------- |
| Data model     | `schema/`, `models/`, `db/`, `drizzle/`, `prisma/`, `*.sql`     | model, migration, table, column |
| API            | `routes/`, `handlers/`, `controllers/`, `api/`, `server/`       | endpoint, route, handler        |
| Infrastructure | `terraform/`, `infra/`, `ci/`, `.github/`, `deploy/`, `docker/` | pipeline, deploy, provision     |
| General        | スコープなし。Explore に発見させる                              | none                            |

### 検証

締めで `${CLAUDE_SKILL_DIR}/references/verification.md` の検証を適用する。網羅性 finding には Cross-method 検証、外部システムの挙動に関する主張には一次ソース検証を構造的に適用し、自己判断による finding 除外は認めない。ライブラリ API 挙動の検証は `~/.claude/rules/development/SOURCING.md` を適用し、scout が不在か接続に失敗したときは WebFetch / WebSearch にフォールバックする。

## Phase 5: Strong Inference (Bug investigation のみ)

`~/.claude/rules/core/OPERATION.md § Debug Investigation Protocol` を適用してバグを消去し、root cause を確定したら `${CLAUDE_SKILL_DIR}/references/verification.md § Same-origin sweep` を実施する。

## Phase 6: Advisor 事前統合チェック

パラメータなしで `advisor()` を起動する。advisor は会話履歴全体を参照する。見落とし領域や弱い推論を指摘されたら、Phase 4 に戻ってスコープを絞り直す。

以下の条件がすべて成立するときのみ起動を省略し、その理由を出力に記録する。

- Phase 2 で過去調査がヒットし、現在の実行は引き継ぎのみ
- 意図が Understanding かつドメインが General
- リポジトリを跨ぐ主張や PR スコープを駆動する主張がない

## Phase 7: 統合

1. Phase 2 で過去調査が見つかれば、引き継いだ発見事項 / 制約を Key Findings に統合し、再検証済み / 上書き済みを示す
2. 各発見事項が Phase 4 の記法でソースを持つことを確認する。事実は `file:line` またはコマンド出力で裏付け、不足は `unknown, requires X` とする
3. 各発見事項を triage する。次のアクションを持てるのは、`$ARGUMENTS` の質問への直接回答、OUTCOME.md の Behavior / Constraints の前進 / 保護、実在の incident (issue / バグ報告) への対処のいずれかに紐づく発見のみで、紐付け先をアクション欄に明記する。紐づかない発見は次のアクションを「記録のみ」とし、発見自体は全件掲載を維持する
4. Disconfirmation を記録する。Phase 5 実施時は `Covered by Phase 5 elimination`、省略時は scratch から実行コマンドと生出力をそのまま引用する。0 件の結果は「不在」と断じる前に「ツール誤用の可能性」とみなす
5. Phase 3 の質問にすべて回答した、または `unknown, requires X` と記録したことを確認する

## 出力

`${CLAUDE_SKILL_DIR}/templates/research.md` の骨格に従ってレポートを生成し、`${CLAUDE_SESSION_ID}` を埋めて `.claude/workspace/research/YYYY-MM-DD-<slug>.md` に保存する。

## 完了条件

すべて満たすまで完了としない。条件列に「(...)」がある項目は、該当する場合のみ必須。

| 項目              | 条件                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| OUTCOME           | `.claude/OUTCOME.md` が存在する (Phase 1)                                                                       |
| Prior research    | `Prior research` フィールドが埋まっている。値は slug または `none found`                                        |
| ソース            | すべての発見事項に明示的なソース、または `unknown, requires X` 注記がある                                       |
| triage            | すべての次のアクションに紐付け先 (質問 / OUTCOME / incident) の明記、または「記録のみ」がある                   |
| 監査証跡          | Phase 4 の scratch を、コマンドと生出力をそのままで取得した                                                     |
| Cross-method      | 網羅性主張に Cross-method 検証を実施した (該当する主張がある場合)                                               |
| 一次ソース        | 動作を左右する外部仕様 claim を一次ソースと突合した、または unverified とマークした (該当する claim がある場合) |
| Same-origin sweep | Bug intent で root cause 確定時に sweep を実施した (該当する場合)                                               |
| advisor           | Phase 6 の advisor を起動した、または省略理由を記録した                                                         |
| 保存              | 出力を `workspace/research/` に保存した                                                                         |
