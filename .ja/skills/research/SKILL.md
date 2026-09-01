---
name: research
description: プロジェクトと技術的な質問を調査する。発見事項は結論ではなく、明示的なソース付きで反証にさらすべき主張として扱う。Phase 6 では統合の前に critic-design が発見事項へ反論する。設計計画や plan 生成には使わない (代わりに /think を使う)。
when_to_use: 調査して, 調べて, リサーチ, investigate, 分析して, issueやろう, issue見て, 横並びチェック, 類似パターン検出, refactor 横展開
allowed-tools: Bash(tree:*) Bash(git log:*) Bash(git diff:*) Bash(git show:*) Bash(wc:*) Bash(scout:*) Read LS Agent AskUserQuestion Bash(ugrep:*) Bash(bfs:*) Bash(codegraph:*) Bash(node:*) Bash(${CLAUDE_SKILL_DIR}/scripts/*)
model: opus
context: fork
argument-hint: "[research subject or question]"
---

# /research - プロジェクト / 技術調査

## 入力

調査対象は `$ARGUMENTS` で受け取る。自由記述のトピックまたは質問。空なら AskUserQuestion でユーザーに確認する。

## ソース記法

事実は `file:line` かコマンド出力、推論は `inferred from X`、未検証は `unknown, requires X`。各 Phase と出力テンプレートの言うソース記法はこれで、他の形式は認めない。

## Phase 1: アウトカム参照

`.claude/OUTCOME.md` を読む。存在しない場合は `/outcome` で雛形を生成する。調査が Non-goals へ踏み込む場合は、進める前にユーザーへ確認する。

## Phase 2: 過去調査スキャン

`$ARGUMENTS` から小文字ハイフン区切りの slug を作り、`${CLAUDE_SKILL_DIR}/scripts/find-prior-research.py <slug> .claude/workspace/research` を実行する。標準出力の JSON `{ candidates: [{file, shared}, ...], slug_words: int }` (shared 降順) をパースする。

- 候補が 0 件のとき、レポートの Prior research を `none found` として先へ進む
- shared 2 以上、または shared が `slug_words` と等しい候補は下表のとおり引き継ぐ
- 残る shared 1 の候補は、slug が 2 語以上でファイル名の語の重なりだけが根拠なので、下表の引き継ぎ対象外とし、レポートの References にパスと shared 数を記載するに留める

| 抽出元               | 引き継ぎ先 | 扱い                                                                                             |
| -------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| Key Findings 表      | Phase 7    | ベースラインとして再検証または上書き                                                             |
| Constraints 表       | Phase 4    | 引き継ぎ元の Domain が現在の Domain と一致するときだけ入力として使い、一致しなければ再発見に戻す |
| Disconfirmation 結果 | Phase 7    | 参照する                                                                                         |

## Phase 3: 意図とドメインの明確化

`$ARGUMENTS` で意図とドメインの両方が明確なら省略する。そうでなければ AskUserQuestion で選ばせる。意図の選択肢は Feature planning、Bug investigation、Understanding。ドメインの選択肢は Data model、API、Infrastructure、General。

## Phase 4: ドメインスコープ並列調査

入力は 2 つある。Phase 3 が選ばせた意図とドメインが下のドメイン表の行を決め、Phase 2 の引き継ぎ表が渡す Constraints 表は、引き継ぎ元の Domain が現在の Domain と一致するときだけ入力に取る。

Explore、ugrep、bfs、Read を並列起動する。各コマンドと生出力は scratch にそのまま追記する。これが監査証跡で、Phase 7 の Disconfirmation はここから直接引用し再構築しない。発見事項にはその場でソースを書く。

意図が Feature planning か Bug investigation なら `Agent(subagent_type: explorer-feature)` も起動する。この起動はバックグラウンドで走るので、他の探索を続けながら完了通知を待つ。返り値は `{ findings: [{ statement: string, source: string }] }` の JSON 1 object で受け取り、受け取るまで次の Phase へ進まない。この起動条件に当たるとき、または `.codegraph/` index があるときは ${CLAUDE_SKILL_DIR}/references/tactics.md を読み、該当する手段を適用する。

ドメインが General 以外なら ${CLAUDE_SKILL_DIR}/references/domain-scope.md を読み、探索にルートと語を掛ける。

finding が出そろったら ${CLAUDE_SKILL_DIR}/references/verification.md を読み、finding の種類に該当する検証を適用する。この読み込みは意図とドメインによらず毎回行う。

## Phase 5: Strong Inference (Bug investigation のみ)

${CLAUDE_SKILL_DIR}/../../rules/core/OPERATION.md § Debug Investigation Protocol を適用してバグを消去する。root cause を確定したら ${CLAUDE_SKILL_DIR}/references/verification.md § Same-origin sweep を実施する。

## Phase 6: 統合前の反論

`Agent(subagent_type: critic-design)` を起動し、`$ARGUMENTS` の問いと Phase 4 の発見事項をソース付きで渡す。返る verdict と weaknesses は agent 定義が決める。weakness が見落とし領域や弱い推論を指すときは、Phase 4 に戻ってスコープを絞り直す。

以下の条件がすべて成立するときのみ起動を省略し、その理由を出力に記録する。

- Phase 2 で過去調査がヒットし、Phase 4 の発見事項に、その Key Findings へ含まれない新規のものが無い
- 意図は Understanding で、ドメインが General
- リポジトリを跨ぐ主張や PR スコープを駆動する主張がない

## Phase 7: 統合

1. Phase 2 で過去調査が見つかれば、引き継いだ発見事項/制約を Key Findings に統合し、再検証済み/上書き済みを示す
2. 各発見事項がソース記法でソースを持つことを確認する。不足は `unknown, requires X` とする
3. 各発見事項を triage する。次のアクションを持てるのは、`$ARGUMENTS` の質問への直接回答、OUTCOME.md の Behavior か Constraints の前進または保護、実在の incident (issue やバグ報告) への対処のいずれかに紐づく発見に限る。紐づく発見は紐付け先をアクション欄に明記する。紐づかない発見は次のアクションを「記録のみ」とする。どちらの場合も発見は全件掲載する
4. Disconfirmation を記録する。Phase 5 実施時は `Covered by Phase 5 elimination`、省略時は scratch から実行コマンドと生出力をそのまま引用する。0 件の結果は「不在」と断じる前に「ツール誤用の可能性」とみなす
5. Phase 3 の質問にすべて回答した、または `unknown, requires X` と記録したことを確認する

## Phase 8: 出力

${CLAUDE_SKILL_DIR}/templates/research.md の骨格に従ってレポートを生成し、`${CLAUDE_SESSION_ID}`を埋めて`.claude/workspace/research/YYYY-MM-DD-<slug>.md` に保存する。

保存後、テンプレートの Next Steps 表から渡し先を選んで会話で提案する。いずれも自動実行しない。提案には保存したレポートのパスと、slug の元になった語をそのまま添える。`/think` はその語から slug を作り、同じ script でこのレポートを引くので、語がずれると引けなくなる。

## 完了条件

すべて満たすまで完了としない。条件列に「(...)」がある項目は、該当する場合のみ必須。

| 項目              | Phase   | 条件                                                                                                                |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| OUTCOME           | Phase 1 | `.claude/OUTCOME.md` が存在する                                                                                     |
| Prior research    | Phase 2 | `Prior research` フィールドが埋まっている。値は slug または `none found`                                            |
| 監査証跡          | Phase 4 | scratch を、コマンドと生出力をそのままで取得した                                                                    |
| Cross-method      | Phase 4 | 網羅性主張に Cross-method 検証を実施した (該当する主張がある場合)                                                   |
| 一次ソース        | Phase 4 | 動作を左右する外部仕様 claim に一次ソース検証を実施した、または unverified とマークした (該当する claim がある場合) |
| Same-origin sweep | Phase 5 | Bug intent で root cause 確定時に sweep を実施した (該当する場合)                                                   |
| 反論              | Phase 6 | critic-design を起動した、または省略理由を記録した                                                                        |
| ソース            | Phase 7 | すべての発見事項に明示的なソース、または `unknown, requires X` 注記がある                                           |
| triage            | Phase 7 | すべての次のアクションに紐付け先 (質問 / OUTCOME / incident) の明記、または「記録のみ」がある                       |
| 保存              | Phase 8 | 出力を `.claude/workspace/research/` に保存した                                                                     |
| 渡し先            | Phase 8 | Next Steps 表から渡し先を提案し、レポートのパスと slug の語を添えた                                                 |
