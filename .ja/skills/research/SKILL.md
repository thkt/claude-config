---
name: research
description: プロジェクトと技術的な質問を調査する。発見事項は結論ではなく、明示的なソース付きで反証にさらすべき主張として扱う。Phase 6 では統合が確定する前に advisor がそれへ反論する。設計計画や plan 生成には使わない (代わりに /think を使う)。
when_to_use: 調査して, 調べて, リサーチ, investigate, 分析して, issueやろう, issue見て, 横並びチェック, 類似パターン検出, refactor 横展開
allowed-tools: Bash(tree:*) Bash(git log:*) Bash(git diff:*) Bash(git show:*) Bash(wc:*) Bash(scout:*) Read LS Agent AskUserQuestion Bash(ugrep:*) Bash(bfs:*) Bash(codegraph:*) Bash(node:*) Bash($HOME/.claude/skills/research/scripts/*)
model: opus
context: fork
argument-hint: "[research subject or question]"
---

# /research - プロジェクト / 技術調査

コードベースを調査し、発見事項をソース付きで記録する。実装は伴わない。

## 入力

調査対象は `$ARGUMENTS` で受け取る。自由記述のトピックまたは質問。空なら AskUserQuestion でユーザーに確認する。

## Phase 1: アウトカム参照

`.claude/OUTCOME.md` を読む。存在しない場合は `/outcome` で雛形を生成する。調査が Non-goals へ踏み込む場合は、進める前にユーザーへ確認する。

## Phase 2: 過去調査スキャン

`$ARGUMENTS` から小文字ハイフン区切りの slug を作り、`${CLAUDE_SKILL_DIR}/scripts/find-prior-research.py <slug> .claude/workspace/research` を実行する。標準出力の JSON `{ candidates: [{file, shared}, ...] }` (shared 降順) をパースする。

- 候補が 0 件のとき「No prior research found for `<slug>`」と注記して先へ進む
- shared 2 以上の候補は下表のとおり引き継ぐ
- shared 1 の候補はファイル名の語の重なりだけでは一致の根拠として弱いので、下表の引き継ぎ対象外とし、レポートの References にパスと shared 数を記載するに留める

| 抽出元               | 引き継ぎ先 | 扱い                                 |
| -------------------- | ---------- | ------------------------------------ |
| Key Findings 表      | Phase 7    | ベースラインとして再検証または上書き |
| Constraints 表       | Phase 4    | 入力として使い再発見しない           |
| Disconfirmation 結果 | Phase 7    | 参照する                             |

## Phase 3: 意図とドメインの明確化

`$ARGUMENTS` で意図とドメインの両方が明確なら省略する。そうでなければ AskUserQuestion で選ばせる。意図の選択肢は Feature planning、Bug investigation、Understanding。ドメインの選択肢は Phase 4 の表のドメイン列で、General はスコープなし。

## Phase 4: ドメインスコープ並列調査

Explore、ugrep、bfs、Read を並列起動する。各コマンドと生出力は scratch にそのまま追記する。これが監査証跡で、Phase 7 の Disconfirmation はここから直接引用し再構築しない。

### ソース記法

発見事項にはその場でソースを書く。事実は `file:line` かコマンド出力、推論は `inferred from X`、未検証は `unknown, requires X`。これが後続 Phase と出力テンプレートの言うソース記法で、他の形式は認めない。

意図が Feature planning か Bug investigation なら `Agent(subagent_type: explorer-feature)` も起動する。この起動はバックグラウンドで走るので、他の探索を続けながら完了通知を待つ。返り値は `{ findings: [{ statement: string, source: string }] }` の JSON 1 object で受け取り、受け取るまで次の Phase へ進まない。この起動条件に当たるとき、または `.codegraph/` index があるときは ${CLAUDE_SKILL_DIR}/references/tactics.md を読み、該当する手段を適用する。締めでは ${CLAUDE_SKILL_DIR}/references/verification.md を読み、finding の種類に該当する検証を適用する。

### ドメインスコープ

ドメインは下表でスコープする。Explore にはプロンプトでルートを渡し、ugrep と bfs には語を追加し、Read はルートを起点にする。対象ドメインの glob ルートが全て不在なら General にフォールバックする。

| ドメイン       | glob ルート                                                     | ドメインに沿った語              |
| -------------- | --------------------------------------------------------------- | ------------------------------- |
| Data model     | `schema/`, `models/`, `db/`, `drizzle/`, `prisma/`, `*.sql`     | model, migration, table, column |
| API            | `routes/`, `handlers/`, `controllers/`, `api/`, `server/`       | endpoint, route, handler        |
| Infrastructure | `terraform/`, `infra/`, `ci/`, `.github/`, `deploy/`, `docker/` | pipeline, deploy, provision     |
| General        | スコープなし。Explore に発見させる                              | none                            |

## Phase 5: Strong Inference (Bug investigation のみ)

`~/.claude/rules/core/OPERATION.md § Debug Investigation Protocol` を適用してバグを消去する。root cause を確定したら ${CLAUDE_SKILL_DIR}/references/verification.md § Same-origin sweep を実施する。

## Phase 6: Advisor 事前統合チェック

パラメータなしで `advisor()` を起動する。advisor は会話履歴全体を参照する。見落とし領域や弱い推論を指摘されたら、Phase 4 に戻ってスコープを絞り直す。

以下の条件がすべて成立するときのみ起動を省略し、その理由を出力に記録する。

- Phase 2 で過去調査がヒットし、現在の実行は引き継ぎのみ
- 意図は Understanding で、ドメインが General
- リポジトリを跨ぐ主張や PR スコープを駆動する主張がない

## Phase 7: 統合

1. Phase 2 で過去調査が見つかれば、引き継いだ発見事項/制約を Key Findings に統合し、再検証済み/上書き済みを示す
2. 各発見事項が Phase 4 のソース記法でソースを持つことを確認する。不足は `unknown, requires X` とする
3. 各発見事項を triage する。次のアクションを持てるのは、`$ARGUMENTS` の質問への直接回答、OUTCOME.md の Behavior か Constraints の前進または保護、実在の incident (issue やバグ報告) への対処のいずれかに紐づく発見のみで、紐付け先をアクション欄に明記する。紐づかない発見は次のアクションを「記録のみ」とし、発見自体は全件掲載を維持する
4. Disconfirmation を記録する。Phase 5 実施時は `Covered by Phase 5 elimination`、省略時は scratch から実行コマンドと生出力をそのまま引用する。0 件の結果は「不在」と断じる前に「ツール誤用の可能性」とみなす
5. Phase 3 の質問にすべて回答した、または `unknown, requires X` と記録したことを確認する

## 出力

${CLAUDE_SKILL_DIR}/templates/research.md の骨格に従ってレポートを生成し、`${CLAUDE_SESSION_ID}`を埋めて`.claude/workspace/research/YYYY-MM-DD-<slug>.md` に保存する。

## 完了条件

すべて満たすまで完了としない。条件列に「(...)」がある項目は、該当する場合のみ必須。

| 項目              | 条件                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| OUTCOME           | `.claude/OUTCOME.md` が存在する (Phase 1)                                                                           |
| Prior research    | `Prior research` フィールドが埋まっている。値は slug または `none found`                                            |
| ソース            | すべての発見事項に明示的なソース、または `unknown, requires X` 注記がある                                           |
| triage            | すべての次のアクションに紐付け先 (質問 / OUTCOME / incident) の明記、または「記録のみ」がある                       |
| 監査証跡          | Phase 4 の scratch を、コマンドと生出力をそのままで取得した                                                         |
| Cross-method      | 網羅性主張に Cross-method 検証を実施した (該当する主張がある場合)                                                   |
| 一次ソース        | 動作を左右する外部仕様 claim に一次ソース検証を実施した、または unverified とマークした (該当する claim がある場合) |
| Same-origin sweep | Bug intent で root cause 確定時に sweep を実施した (該当する場合)                                                   |
| advisor           | Phase 6 の advisor を起動した、または省略理由を記録した                                                             |
| 保存              | 出力を `.claude/workspace/research/` に保存した                                                                     |
