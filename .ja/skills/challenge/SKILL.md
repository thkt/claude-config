---
name: challenge
description: 発見した問題が本物か、提案したアイデアが使えるかを 2 フェーズで判定する。Phase 1 は OUTCOME.md と並列 subagent の証拠に対し、subagent 検証と advisor 判断をループで回して設計の分岐を自力で解決する。残る分岐のうち不可逆なものだけをユーザーへ確認し、他は仮定を明記して進める。Phase 2 は critic-design の subagent 2 体 (内部攻撃 / OUTCOME.md 攻撃) を devil's advocate として起動する。判定は GO / NO-GO を最上段に出す。コードレビューの findings には使わない (/audit を使う)。outcome の assertion にも使わない (/assert に adversarial testing が組み込まれている)。
when_to_use: devils advocate, 反論, チャレンジ, challenge, 叩いて, 穴探し, grill me, 壁打ち
allowed-tools: Read LS Task AskUserQuestion
model: opus
argument-hint: "[proposal file | description]"
---

# /challenge - 提案の GO / NO-GO 判定

提案を 2 フェーズで判定し、次の意思決定を検証済みの GO/NO-GO から始めさせる。

## 入力

`$ARGUMENTS` に対象を受け取る。提案のファイルパスか、記述そのものを渡す。空なら停止して対象の指定をユーザーに求め、会話から推測しない。複数行のときは先頭行が対象のタイトル。

## Phase 1: Grill

証拠で提案を自力で締め上げ、解けなかった残差だけを可逆性で振り分けてユーザーに返す。

1. OUTCOME.md があれば読む。無ければ `$ARGUMENTS` と会話から outcome を推定し、AskUserQuestion で確認する。確定した outcome は Phase 2 の outcome 攻撃の評価軸になる
2. 提案の論点を洗い出して振り分ける。証拠で答えが 1 つに決まる論点は事実、優先順位/スコープ/トレードオフのように選択が要る論点は判断。振り分けは論点の性質で決め、advisor の自信度では決めない
3. 検証ループを回す。subagent が事実を並列で確かめ、advisor が振り分けを見直して次の証拠を指し、メインセッションが継続を決める。証拠を足しても振り分けが変わらなくなったら打ち切る。上限 3 周。決着しなかった論点は残差へ持ち越す
4. 確かめた事実が提案の中核を覆したら、Phase 2 を飛ばして覆した根拠を Why に据える。中核が覆るのは、狙う状態が既に成立しているか、事実と矛盾するとき。advisor の見解だけでは止めない。一部の主張だけ崩れたなら、生きている部分で続ける
5. 残った論点が残差。advisor が各残差に仮説と可逆性/影響度を付け、後戻りできないか影響の大きいものだけ AskUserQuestion で聞く。上限 7 問。残りは仮説を仮定として進め、その残差と subagent に委ねた論点は Why に全件残す

### Phase 2 への入力

Phase 1 の発見を次の形に集約してから起動する。

| 項目             | ソース                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| approach         | 提案の中核の 1 行要約                                                                              |
| decisions        | 固まったアーキテクチャ水準の判断。用語確認やスコープ細部は除く                                     |
| trade-offs       | 表面化したトレードオフ                                                                             |
| referenced_files | 参照したファイル                                                                                   |
| outcome_ref      | OUTCOME.md のパスと Behavior / Non-goals / Constraints の要約。無ければ Phase 1 で確認した outcome |

## Phase 2: Devil

Phase 1 の素材を critic-design 2 体に敵対的に当て、穴を探す。

| Pass                    | 役割                                                      |
| ----------------------- | --------------------------------------------------------- |
| critic-design (内部)    | 提案そのものを攻撃し、隠れた弱点と破綻の経路を出す        |
| critic-design (outcome) | outcome への適合と non-goal / constraint の侵害を攻撃する |

1. critic-design を Task で 2 体並列に起動する。subagent_type は critic-design、run_in_background は false。一方は内部攻撃、もう一方に `outcome_ref` を渡して outcome 攻撃。outcome を確定できなければ outcome 攻撃は省略する。`ARCHITECTURE.md` 等があれば言及する。起動プロンプトに対象のタイトルをそのまま含める。返り値は agent 定義どおり verdict (confirmed/weakened/needs_revision) と weaknesses (viewpoint、severity、finding、evidence、disconfirming probe を持つ項目の配列)
2. 両者の完了を待ち、弱点を突き合わせて重複を除く。片方でも needs_revision なら NO-GO、両方 confirmed なら GO、それ以外は条件付き GO とし、条件を Verdict 行に併記する
3. 総合判定と Phase 1 の残差を VERDICT_SCHEMA `{ verdict, assumptions: [{ text, irreversible, underspecified }] }` に集約する。次の 3 条件のいずれかに当たれば、出来の良さに関わらず NO-GO へ降格する。不可逆な仮定を含む。仮定が 7 件を超える。内容の曖昧な仮定を含む。降格後は手動で GO に戻さない

## 出力

| セクション       | 内容                                                                     |
| ---------------- | ------------------------------------------------------------------------ |
| Verdict          | GO / NO-GO の 1 行。条件付きなら条件を、降格時は理由を併記する           |
| Why              | 事実検証の結果、critic-design 2 体の判定、仮定で進めた残差の全件と可逆性 |
| Actionable items | keep / remove / revise の具体アクション トップ 3                         |
