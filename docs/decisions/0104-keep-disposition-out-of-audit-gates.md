---
status: "accepted"
date: "2026-08-21"
decision-makers: "thkt"
---

# Keep disposition out of audit gates

## Context and Problem Statement

audit と assert が返す finding は severity (critical/high/medium/low) だけを持つ。severity は影響の大きさを表す軸なので、読んだ人間が次に何をするか、つまりマージを止めるべきか作者の判断に委ねてよいかには答えない。

品質語彙の持ち主はコミット `7a5f7e74` で `/preview` から audit へ移った。`skills/preview/tests/plan-alignment.test.js` が preview へのラベル再登場を禁止している。移った先の audit がまだ語彙を持たないので、語彙をどこに置くかと、それを gate に使うかを同時に決める必要がある。

DR-0078 は finding atom family の共通コアを Severity/Evidence/一行 claim/ID と定めた。disposition はそのコアに足す 1 本目の軸になる。

## Decision Outcome

disposition を `agents/_lib/finding-schema.md` の 1 箇所で定義し、いかなる gate の入力にもしない。既定値は severity から導かず must に固定する。

gate の入力にしない理由は 2 つある。第 1 に、`workflows/assert.js` の ternary gate は severity を見ず `issues.length > 0` だけで NotReady を出す。disposition を足しても gate の分岐は変わらないので、入力にすると読み手に「効いている」と誤解させる。第 2 に、disposition は reviewer が申告できる軸である。gate の入力にすると、reviewer が nits を申告することで gate を通せることになり、裁量で迂回できない品質ゲートという前提が崩れる。

既定値を severity 由来にしない理由も gate の形から出る。gate が severity を見ない以上、high の finding も low の finding も等しくマージを止める。severity 由来の既定値だと、マージを止める finding に nits が付き、行の意味と実際の効き方が逆を向く。

### Consequences

- Good, report を読んだ人間が、finding ごとに自分の判断が要るかどうかを severity を解釈せずに読み取れる
- Good, gate の判定が変わらないので、この変更が原因で通っていた PR が止まることも、止まっていた PR が通ることもない
- Good, DR-0078 の共通コアに軸を足す形が 1 例できる。2 本目の軸を足すときの前例になる
- Bad, disposition と gate が独立するので、must ばかりが並ぶ report でも gate は issue の件数だけを見る。優先順位を gate に反映したくなったときは、この DR の再検討が要る
- Bad, reviewer が申告できる値と script が供給する値が同じ列に並ぶ。供給元の列を読まないと、誰が決めた値か分からない

### Confirmation

- `workflows/audit/tests/audit.triage.test.js` が、申告の無い finding に must が付くこと、理由の無い上書きが must へ戻り件数が log に残ることを検査する
- `workflows/audit/tests/audit.seam.test.js` が、reviewer 出力から返り値までを実モジュールで通し、全 finding が disposition を持つことを検査する
- `workflows/assert/tests/assert.degradation.test.js` が、gate の判定が disposition を読まないことを gate_reason の内容で示す (別 issue)

### Reassessment Triggers

- must 以外の disposition が付いた finding が実際に出て、その扱いが gate と食い違った実例が出たとき
- gate を severity か disposition で分ける必要が生じ、false positive の実例が伴ったとき

## Considered Options

- disposition を severity から機械的に導出する。`workflows/audit.js` の triage は needs_context の finding を survivors から外すので、導出の時点で ask に当たる finding が 0 件になり、must/want/imo/nits は severity の純粋な言い換えへ縮退する
- reviewer 全 18 本に必須フィールドとして持たせる。must は High、want は Medium、imo と nits は Low に対応するため、約 40 ファイルの変更の大部分が severity の言い換えになる
- `workflows/assert.js` の gate を severity で分ける。過去に「gate の緩和は false positive の実例が出たときだけ」と決めており、今回は設計上の不整合の指摘に留まって実例が無い

## More Information

DR-0078 が定めた共通コア (Severity/Evidence/一行 claim/ID) に軸を 1 本足す関係にある。共通コア自体の境界は変えないので、DR-0078 の Reassessment Triggers は発火しない。

### References

- `7a5f7e74` 品質語彙を `/preview` から外し、コード品質は `/code-review` と audit の担当と定めたコミット
- `.claude/workspace/research/2026-08-02-audit-reviewer-refinement.md` category と trigger の透過を prune 品質に効く最も安い変更として記録
