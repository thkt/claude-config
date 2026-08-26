# Research: research-skill-precision-postmortem

Generated: 2026-06-06
Session: 22fc328a-66f5-4619-beb1-226571b8e85b
Intent: Understanding (skill 改善の根拠収集)
Domain: General
Prior research: 2026-05-08 セッション 3ae520de (抜け漏れ対応で advisor 必須化 + cross-method verification 導入。第一推奨「1ホップ展開 coverage check」は未実装のまま残存)

## Purpose

/research スキルの「精度を上げたい」要望に対し、直近 6 件の research 出力を事後検証して実際の失敗モードを特定する。判定表は改善後の eval 正解ラベルとして再利用する。

## 検証方法

3 並列 general-purpose agent。各 research ファイルの Key Findings を、対象リポジトリの git log(research 日付以降)、recall(後続セッション)、現在のコードと照合。判定は correct / wrong / missed / shallow / unverifiable。

## 判定サマリ

| File | 対象                                              | findings | wrong            | shallow | 抜け漏れ(load-bearing)                     | eval 役割          |
| ---- | ------------------------------------------------- | -------- | ---------------- | ------- | ------------------------------------------ | ------------------ |
| 1    | 2026-05-11-sae-100-adr-0060-prep                  | 13       | 0 (F4 partially) | 0       | なし(ADR-0066 予見不能は除外印)            | regression         |
| 2    | 2026-05-08-issue-53-aiano-annotation-framework    | 10       | 0                | 0       | なし(arXiv 未検証は standing)              | regression         |
| 3    | 2026-05-08-issue-104-rrf-merge-unification        | 8        | 0                | 0       | なし(順序過剰保守は注記のみ)               | regression         |
| 4    | 2026-05-07-issue-69-label-from-issue-push-failure | 6        | 0                | 1       | **policy file schema 破損の見逃し**        | **discriminating** |
| 5    | 2026-05-07-knowledge-reflection-cache-safe-design | 4        | **1**            | 0       | **Stop hook 毎ターン発火コストの見落とし** | **discriminating** |
| 6    | 2026-05-02-confirmation-bias-skill-gaps           | 5        | 1 (remedy)       | 0       | Gap1/2 統一原理の見落とし(ADR-0071 が補完) | regression         |

事実の正確性は高い(46 findings 中 wrong 2 件)。cross-method verification(2026-05-08 導入)が precision 側で機能している。失敗の主形態は miss、その中でも以下の 2 パターンが load-bearing。

## Load-bearing failures(eval discriminating cases)

### F5-wrong: Stop hook 発火タイミングの事実誤認(File 5)

- 当時の主張: 「Stop hook はセッション終了時に動く。実行時点で現セッションの cache 利用は終わっており」(L52)
- 実際: Stop は assistant turn ごとに発火(実測最大 29 回/session)。セッション終了は SessionEnd。公式 hooks docs に明記
- 帰結: 毎ターン × haiku 17-83s のコストを設計でモデル化できず、実装 5112f69(2026-05-14)は 2026-05-31 に無効化。機構全体の束縛条件になった
- 根拠: memory project_reflection-hook-redesign.md、公式 hooks doc("When Claude finishes responding" / "once per turn")
- 同型の軽度事例: File 6 Disconfirmation が未検証 arXiv 2603.18740 に依拠(ADR-0071 は同ソースを論拠から明示除外)、File 2 の arXiv 2602.04579 未検証 standing
- スキルが catch すべきだった点: 外部システムの挙動を前提にする finding を一次ソース(公式 docs)で検証する機構がなかった

### F4-miss: 同一生成工程の兄弟 artifact 見逃し(File 4)

- 当時の結論: workflow の `uses:` 行の CF email-obfuscation placeholder が root cause、2-step pattern で修正すれば動く
- 実際: 同じ harvest 工程由来で policy file(advanced-issue-labeler.yml)の schema も破損していた(block-list が全 dropdown 値を除外 = workflow が parse できてもラベルが 1 つも付かない、label が plain string list で要求形式 object[] {name, keys} でない)。修正 9c839c1 が Policy fix を別途実施
- 辺の性質(2026-06-06 確認): workflow は policy file を明示参照しない。advanced-issue-labeler action が convention で `.github/advanced-issue-labeler.yml` を implicit に読む。**import-graph 1ホップでは捕れない**。同一 origin(同じ harvest/deploy 工程)展開でのみ捕れる
- スキルが catch すべきだった点: root cause 特定後、その root cause の作用範囲(同一生成工程・同一コミット・同一テンプレート由来)にある artifact を列挙して同種欠陥を検証する機構がなかった

## 除外印(スキルでは直せない miss、eval 正解ラベルから除外)

| 事例                                   | 理由                                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| File 1: ADR-0066 出現の予見漏れ        | research の 2 日後に発生した意思決定。本質的に予見不能                                                                      |
| File 1: amici envelope uplift 全面却下 | fact error でなく実装側の divergence。代替経路併記は /think の領分(research description が design planning を明示除外)      |
| File 3: recall→rurico 順序の過剰保守   | 機構認識は正。confidence calibration の問題で、せいぜい synthesis の一文(hard prerequisite と safe-default ordering の区別) |
| File 6: Gap1/2 統一原理の見落とし      | 統一原理の発見は ADR-0071 の設計作業(DA verdict 起点)。research 単体に求めるのは過剰                                        |

## 失敗モード → 対策マッピング

| #   | 失敗モード                        | 該当                     | 対策候補                                                                                                               |
| --- | --------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| M1  | 外部仕様 claim の一次ソース未検証 | F5-wrong, File 6/2 arXiv | 外部システム挙動・引用文献を前提にする finding は一次ソース検証必須。辿れなければ Disconfirmation の根拠に使用禁止     |
| M2  | root cause 作用範囲の未展開       | F4-miss                  | Bug investigation で root cause 特定後、同一 origin artifact(同一生成工程/コミット/テンプレート)を列挙し同種欠陥を検証 |
| -   | 推奨複線化                        | File 1/3                 | 採用しない(/think の領分)。synthesis に confidence calibration 一文の検討のみ                                          |

## eval 設計

- discriminating: File 4(M2 を検証)、File 5(M1 を検証)。改善後スキルで再実行し、policy file 破損 / Stop hook 毎ターン発火を catch できるかが合否
- regression: File 1/2/3/6。改善後も既存 findings の正確性を維持し、新たな wrong を入れないこと
- 除外印付き miss は合否判定に含めない(到達不能な miss 率を追わない)
- 再実行コスト: 1 ケース = フル research 1 回。discriminating 2 件先行で十分

## References

| Path                                                                    | Description                          |
| ----------------------------------------------------------------------- | ------------------------------------ |
| workspace/research/2026-05-11-sae-100-adr-0060-prep.md                  | File 1                               |
| workspace/research/2026-05-08-issue-53-aiano-annotation-framework.md    | File 2                               |
| workspace/research/2026-05-08-issue-104-rrf-merge-unification.md        | File 3                               |
| workspace/research/2026-05-07-issue-69-label-from-issue-push-failure.md | File 4                               |
| workspace/research/2026-05-07-knowledge-reflection-cache-safe-design.md | File 5                               |
| workspace/research/2026-05-02-confirmation-bias-skill-gaps.md           | File 6                               |
| github-labels 9c839c1 / scout 21651f0                                   | File 4 修正コミット(Policy fix 含む) |
| memory: project_reflection-hook-redesign.md                             | File 5 帰結の記録                    |
| docs/decisions/0071-\*.md                                               | File 6 Gap1/2 の補完 ADR             |

## Eval 実行結果 (2026-06-07)

M1/M2 組み込み後(critic-design の weakened verdict 2 件を充填: M2 インライン fetch-verify、scout/git show grant)、discriminating 2 ケースを fresh subagent(答え非供与)で再実行した。

| Case | 再実行設計 | 結果 | 判定 |
|---|---|---|---|
| F5 | 当時の issue #37 相当の前提調査を再フレーム(Feature planning、memory/workspace 読み込み禁止) | 「Stop fires once per TURN」を一次ソース検証付きで Priority 1 finding 化。Disconfirmation で per-session 記述の不在まで反証検査 | PASS |
| F4 | 21651f0~1 を worktree 再現、bug investigation として再実行 | Same-origin Sweep 発動(3fb3e4c の 4 ファイル列挙 + 生成元表記検出)。label 形式違反を different-kind defect として catch。block-list 全除外(全 dropdown 値と一致する意味的破損)は「キーとして valid」止まりで見逃し | PARTIAL |

- 付随確認: 両 subagent で scout 実行成功(fetch / repo-read / repo-overview)。M1 のサイレント死は subagent 環境では否定。残留 unknown: `context: fork` 実セッション内の network egress(/research 実運用初回で確認)
- F4 PARTIAL への対処: M2 に Step 4(兄弟間で参照し合う値集合の diff、自滅的整合のフラグ)を追加(2026-06-07)
- F4 再 eval(Step 4 入り、同一中立プロンプト): **FULL PASS**。「block-list is self-defeating: it forbids every selectable value」を値集合 diff で Priority 5 finding 化、Same-origin Sweep に Step 4 cross-reference を明記。label 形式違反 + block-list 全除外の両方を catch
- F5 PASS の caveat: fresh agent は ADR-0068(当時の research より後発、per-turn 問題を記述)と reflection-extract.sh を読めた(docs/decisions/ は遮断していない)。pristine な PASS ではない。ただし Disconfirmation(「per-session 記述は docs に存在しない」の反証検査)は公式 docs に対して独立に実行されており、M1 の検証強制は機能した
- critic-design low finding(prose に出る外部 claim は Source 列トリガーを逃れる)は F5 再実行では顕在化せず(finding 行に正しく乗った)

## Next Steps

| 順  | Action                                                    | 状態 |
| --- | --------------------------------------------------------- | --- |
| 1   | M1/M2 の SKILL.md 組み込み設計(ユーザー承認後)            | 完了 (2026-06-07) |
| 2   | discriminating 2 ケースで改善後スキルを再実行、catch 検証 | 完了 (F5 PASS w/ caveat / F4 PARTIAL → M2 Step 4 追加) |
| 3   | regression 4 ケースは判定表との突き合わせで確認           | 未実施(実運用の research 出力で随時) |
| 4   | M2 Step 4(値集合 diff)の再 eval                          | 完了 (2026-06-07 FULL PASS、block-list 自滅整合を検出) |
