---
name: challenge
description: 発見した問題が本物か、提案したアイデアが使えるかを 2 フェーズで判定する。Phase 1 は OUTCOME.md と並列 subagent の証拠に対し、subagent 検証と advisor 判断をループで回して設計の分岐を自力で解決する。残る分岐のうち不可逆なものだけをユーザーへ確認し、他は仮定を明記して進める。Phase 2 は critic-design の subagent 2 体 (内部攻撃 / OUTCOME.md 攻撃) を devil's advocate として起動する。判定は GO / NO-GO を最上段に出す。コードレビューの findings には使わない (/audit を使う)。outcome の assertion にも使わない (/assert に adversarial testing が組み込まれている)。
when_to_use: devils advocate, 反論, チャレンジ, challenge, 叩いて, 穴探し, grill me, 壁打ち
allowed-tools: Read LS Agent AskUserQuestion
model: opus
argument-hint: "[proposal file | description]"
---

# /challenge - 提案の GO / NO-GO 判定

提案を 2 フェーズで判定し、次の意思決定を検証済みの GO/NO-GO から始めさせる。

## 入力

`$ARGUMENTS` に対象を受け取る。提案のファイルパスか、記述そのものを渡す。空なら停止して対象の指定をユーザーに求め、会話から推測しない。複数行のときは先頭行が対象のタイトル。

## Phase 1: Grill

証拠で提案を自力で締め上げ、解けなかった残差だけをユーザーへ返す。論点と残差の扱いは下表が定める。

| 条件                                             | 扱い                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 証拠で答えが 1 つに決まる論点                    | 事実。subagent の検証へ回す                                                               |
| 優先順位/スコープ/トレードオフなど選択が要る論点 | 判断。残差へ回す。advisor の自信度では振り分けない                                        |
| 狙う状態が既に成立している、または事実と矛盾する | 中核が覆った。Phase 2 を飛ばし、覆した根拠を Why に据える。advisor の見解だけでは止めない |
| 一部の主張だけが事実と食い違う                   | 生きている部分で続ける                                                                    |
| 残差が不可逆か影響が大きい                       | AskUserQuestion で聞く。上限 7 問                                                         |
| それ以外の残差                                   | advisor の仮説を仮定として進め、Why に全件残す                                            |

1. `.claude/OUTCOME.md` を読む。無ければ `$ARGUMENTS` と会話から outcome を推定し、AskUserQuestion で確認する。Phase 2 の outcome 攻撃がこれを評価軸に使うので、省略せず確定させる
2. 提案の論点を洗い出し、事実と判断へ振り分ける
3. 検証ループを回す。subagent が事実を並列で確かめ、advisor が振り分けを見直して次の証拠を指す
4. 証拠を足しても振り分けが変わらなくなったら打ち切る。上限 3 周
5. 確かめた事実を表に当て、中核が覆っていれば Phase 2 を飛ばす
6. 決着しなかった論点を残差とし、advisor が各件に仮説と可逆性/影響度を付ける
7. 残差を表に従って振り分ける

## 引き継ぎ

Phase 1 の発見を次の形に集約してから Phase 2 を起動する。

| 項目             | ソース                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| approach         | 提案の中核の 1 行要約                                                                                        |
| decisions        | 固まったアーキテクチャ水準の判断。用語確認やスコープ細部は除く                                               |
| trade-offs       | 表面化したトレードオフ                                                                                       |
| referenced_files | 参照したファイル                                                                                             |
| outcome_ref      | `.claude/OUTCOME.md` のパスと Behavior / Non-goals / Constraints の要約。無ければ Phase 1 で確認した outcome |

## Phase 2: Devil

Phase 1 の素材を critic-design 2 体に敵対的に当て、穴を探す。

### Step 1: 2 体を起動する

各 Pass の攻撃対象は下表が定める。outcome を確定できなければ outcome の Pass は省略する。

| Pass                    | 攻撃対象                                        |
| ----------------------- | ----------------------------------------------- |
| critic-design (内部)    | 提案そのもの。隠れた弱点と破綻の経路を出す      |
| critic-design (outcome) | outcome への適合と non-goal / constraint の侵害 |

1. critic-design を Agent で 2 体並列に起動する。subagent_type は critic-design
2. 起動プロンプトに対象のタイトルをそのまま入れ、outcome の Pass には `outcome_ref` を渡す
3. 設計ドキュメント (`ARCHITECTURE.md` など、これに限らない) があれば、そのパスを両方の起動プロンプトへ入れる
4. 両者の完了を待つ。返り値は agent 定義どおり verdict (confirmed/weakened/needs_revision) と weaknesses (viewpoint、severity、finding、evidence、disconfirming probe を持つ項目の配列)

### Step 2: 判定する

弱点を突き合わせて重複を除き、仮定を VERDICT_SCHEMA `{ verdict, assumptions: [{ text, irreversible, underspecified }] }` に集約する。判定は下表を上から順に当て、最初に該当した扱いを採る。

| 条件                                                                       | 扱い                                                                 |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `irreversible` か `underspecified` の仮定が残る、または仮定が 7 件を超える | NO-GO。critic-design の verdict に関わらず、手動で GO に上書きしない |
| 片方でも needs_revision を返した                                           | NO-GO                                                                |
| 両方 confirmed を返した                                                    | GO                                                                   |
| それ以外                                                                   | 条件付き GO。条件を Verdict 行に併記する                             |

## 出力

| セクション       | 内容                                                                         |
| ---------------- | ---------------------------------------------------------------------------- |
| Verdict          | GO / NO-GO の 1 行。条件付き GO なら条件を、NO-GO なら該当した条件を併記する |
| Why              | 事実検証の結果、critic-design 2 体の判定、仮定で進めた残差の全件と可逆性     |
| Actionable items | keep / remove / revise の具体アクション トップ 3                             |
