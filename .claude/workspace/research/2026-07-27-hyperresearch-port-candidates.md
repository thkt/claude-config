# Research: hyperresearch-port-candidates

Generated: 2026-07-27
Session: 5321f4f4-0c57-404f-b0de-3fcf3143ad44
Intent: Understanding (skill 改善の根拠収集)
Domain: General
Prior research: 2026-06-06-research-skill-precision-postmortem

## 目的

jordan-gibbs/hyperresearch (v0.9.1、MIT) の機構のうち、`/research` の既知の失敗モードを減らすものを特定し、採用候補と却下理由を切り分ける。

## 選別軸

採否は「hyperresearch にあるか」ではなく「`/research` の実測失敗クラスに当たるか」で決める。postmortem の判定は 46 findings 中 wrong 2 件で、失敗の主形態は miss だった (workspace/research/2026-06-06-research-skill-precision-postmortem.md:28)。したがって citation precision を上げる機構は、`/research` が持たない問題を解いている。

## Key Findings

| 優先度 | 発見事項                                                                                                                                                                                                                                                          | ソース                                                                                                                                  | 次のアクション                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1      | 統合前の標的 gap-fill が miss クラスに直撃する。hyperresearch は draft 前に「何が見つかればこの方向が覆るか」を名指しさせ、その標的を追加取得する。「統合後の修正は patch が要るが、統合前の修正はコストゼロ」が置き場所の根拠                                    | hyperresearch `src/hyperresearch/skills/hyperresearch-8-corpus-critic.md:16`                                                            | 質問への被覆漏れに限定して Phase 6 の前に置く案を `/think` へ (postmortem の miss 対策) |
| 2      | 現行の Phase 6 Disconfirmation は事後的で、scratch の引用と 0 件結果の再解釈しか行わない。未取得のソースを名指しして取りに行く経路がない                                                                                                                          | `.ja/skills/research/SKILL.md:78`                                                                                                       | 優先度 1 と同じ提案に統合する                                                           |
| 3      | 完了条件の被覆 gate が `$ARGUMENTS` の中の問いを見ていない。Phase 7 の 5 と完了条件表の「triage」行が見るのは Phase 3 の AskUserQuestion への回答であって、ユーザー依頼そのものに含まれる小問ではない。4 部構成の依頼に 2 部だけ答えても全行を通過する            | `.ja/skills/research/SKILL.md:79`、`.ja/skills/research/SKILL.md:94`                                                                    | 依頼の分解と被覆確認を Phase 3 に足す案を `/think` へ                                   |
| 4      | 分解側の設計指針として、hyperresearch は「critic は false positive を安く潰せるが false negative は潰せない」を根拠に、冗長でも全ての小問と名指し対象を列挙させている                                                                                             | hyperresearch `src/hyperresearch/skills/hyperresearch-1-decompose.md:104`                                                               | 優先度 3 の提案に判断基準として入れる                                                   |
| 5      | Phase 2 の過去調査スキャンが slug のファイル名一致だけで、本文検索に負ける。slug `research-skill-improvement` での `bfs -name` は 0 件、同じ意図の本文検索 `ugrep -l "/research"` は 7 件ヒットする。現在 23 ファイルが蓄積済みで、引き継ぎが slug の揺れで落ちる | `.ja/skills/research/SKILL.md:26`、本レポート Disconfirmation の実行結果                                                                | ファイル名一致に本文検索を足す案を `/think` へ。SQLite vault は不要                     |
| 6      | 引用検証系 (cite-check、quote-integrity、numeric-consistency) は `/research` に効かない。hyperresearch はこれらを「fact 半分を外部ベンチマークでなく自己計測する」ために置くが、`/research` の wrong 率は既に 46 分の 2                                           | hyperresearch `src/hyperresearch/core/citecheck.py:1-19`、postmortem:28                                                                 | 記録のみ (却下)                                                                         |
| 7      | contradiction graph と source tensions と independence audit は web コーパス前提の機構。ソース同士の対立を扱うが、`/research` が扱うのはコードと一次 docs で、対立の形が違う。近い機能は M2 Same-origin sweep の値集合 diff として既にある                        | hyperresearch `src/hyperresearch/skills/hyperresearch-3-contradiction-graph.md:35`、`.ja/skills/research/references/verification.md:26` | 記録のみ (却下)                                                                         |
| 8      | vault (markdown + SQLite FTS + PageRank + semantic search) は取得コーパスを前提にする。`/research` は外部ソースを大量取得せず、出力レポートだけを蓄積する。優先度 5 は本文検索で足りる                                                                            | hyperresearch README の vault 節、`.ja/skills/research/SKILL.md:83`                                                                     | 記録のみ (却下)                                                                         |
| 9      | tier 自動分類 (light / full) と step skill 分割ロードは、`/research` では intent 分岐と条件付き references 読み込みが同じ役割を果たしている                                                                                                                       | hyperresearch `src/hyperresearch/skills/hyperresearch-1-decompose.md:114`、`.ja/skills/research/SKILL.md:46`                            | 記録のみ (却下、YAGNI)                                                                  |
| 10     | patch-only 修正 (統合後は Read + Edit に tool-lock) は `/research` に対応面がない。レポート生成は 1 回で、修正 agent を分けていない                                                                                                                               | hyperresearch README の load-bearing principles 節                                                                                      | 記録のみ (却下)                                                                         |

## 利用可能なデータ

| Type      | 項目                                                               | メモ                                                             |
| --------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Repo      | jordan-gibbs/hyperresearch v0.9.1 (2026-07-25)、MIT、star 1421     | 16 step skill + 16 subagent + Python CLI                         |
| File      | `src/hyperresearch/skills/hyperresearch-8-corpus-critic.md` 140 行 | 優先度 1 の出典。gap の型は overturning / strengthening / verify |
| File      | `src/hyperresearch/skills/hyperresearch-1-decompose.md` 211 行     | 優先度 3、4 の出典。atomic items と coverage 契約                |
| File      | `.ja/skills/research/SKILL.md` 101 行                              | 改修対象。skill 本体 200 行の上限に対して余裕あり                |
| Eval 資産 | postmortem の discriminating 2 件 (F4 / F5) と regression 4 件     | いずれも既存提案 M1 / M2 用。今回の提案には未対応                |
| Workspace | `workspace/research/` に 23 ファイル                               | `.ja/workspace/research/` は不在。mirror 対象外                  |

## 制約

| カテゴリ | 制約                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| Mirror   | `.ja/skills/research/` が正。英語側は同一コミットで反映する                                                   |
| 出力先   | `workspace/research/` は `.ja/` 側を持たない。今回の実測で確認済み                                            |
| 規模     | skill 本体は 200 行上限。現行 101 行なので、追加は references への切り出しなしで収まる見込み                  |
| 流用範囲 | hyperresearch は MIT だが、移植するのは設計であってコードではない。Python CLI と vault への依存を持ち込まない |
| 重複回避 | 優先度 1 を「root cause の兄弟列挙」に広げると M2 Same-origin sweep と重複する。被覆漏れの標的取得に限定する  |

## Disconfirmation チェック

precision 系機構 (優先度 6) を却下した判断に対する反証検査を行った。

反証仮説は「`/research` の wrong 率は実は高く、precision 機構が要る」。postmortem の判定サマリ表 (workspace/research/2026-06-06-research-skill-precision-postmortem.md:19-26) は 6 ファイル 46 findings で wrong 2 件、shallow 1 件、残りが miss と記録している。wrong 2 件のうち 1 件は remedy 側の誤りで finding 自体ではない。反証は成立しなかった。

優先度 5 の実測は以下のとおり。

```
$ bfs /Users/thkt/.claude/workspace/research -name '*research-skill-improvement*.md'
(0 件)

$ ugrep -l -i "research skill" /Users/thkt/.claude/workspace/research/*.md
(0 件)

$ ugrep -l "/research" *.md
2026-05-11-sae-100-adr-0060-prep.md
2026-05-02-confirmation-bias-skill-gaps.md
2026-06-06-research-skill-precision-postmortem.md
2026-07-12-scribe-setup-ja-canonical-mirror.md
2026-07-13-issue-build-flow-simplification-impact.md
2026-07-08-slice-parent-plan-carry.md
2026-07-10-scribe-mechanism-cleanup.md
```

2 番目の 0 件はツール誤用だった。過去レポートは日本語で「`/research` スキル」と書いており、英語の語順 "research skill" では一致しない。パターンを直した 3 番目で 7 件ヒットしている。ファイル名一致と本文検索の差 (0 対 7) が優先度 5 の根拠。

## References

| パス                                                                 | 説明                                             |
| -------------------------------------------------------------------- | ------------------------------------------------ |
| workspace/research/2026-06-06-research-skill-precision-postmortem.md | 失敗クラス判定の出典。選別軸の根拠               |
| github.com/jordan-gibbs/hyperresearch                                | 調査対象。scout repo-read で本文を取得           |
| src/hyperresearch/skills/hyperresearch-8-corpus-critic.md            | 優先度 1                                         |
| src/hyperresearch/skills/hyperresearch-1-decompose.md                | 優先度 3、4、9                                   |
| src/hyperresearch/skills/hyperresearch-3-contradiction-graph.md      | 優先度 7                                         |
| src/hyperresearch/core/citecheck.py                                  | 優先度 6                                         |
| .ja/skills/research/SKILL.md                                         | 改修対象                                         |
| .ja/skills/research/references/verification.md                       | M1 / M2 の現行実装。優先度 1、7 の重複判定に使用 |

## カバレッジ注記

- hyperresearch README の DeepResearch-Bench 首位という主張は `unverified external claim`。本人が「stratified pilot からの forward-looking projection、第三者検証は pending」と注記しており、機構の有効性の根拠には使っていない
- 優先度 1 の効果量は未測定。hyperresearch 側にも A/B 実測の記載はなく、「統合前の修正はコストゼロ」は設計上の主張であって計測値ではない
- 今回の提案に対応する discriminating eval ケースは既存 6 件に無い。F4/F5 は M1/M2 用で、いずれも対処済み
- Advisor: Phase 6 起動済み。指摘を受けて選別軸を wrong/miss の区別に置き換え、step 分割と patch-only を却下側へ移した

## Next Steps

| 順  | Action                                                                                                                       | 状態   |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | 優先度 1、3、5 を `/think` へ渡して設計する。critic-design の rejection を通す                                               | 未着手 |
| 2   | 優先度 1 の eval は新規作成が要る。同一プロンプトを現行版と gap-fill 入り版で走らせ、後者だけが到達する finding の有無を見る | 未着手 |
| 3   | 優先度 3 の eval も新規作成が要る。4 部構成の依頼を投げ、現行版が一部だけ答えて完了条件を通過するかを確認する                | 未着手 |
