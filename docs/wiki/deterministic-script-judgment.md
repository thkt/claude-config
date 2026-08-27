---
globs: ["**/skills/**/*.md", "**/skills/**/scripts/*"]
scenes: []
---

# 決定論の判定は script へ出す

## 内容

入力から一意に決まる判定は script に置き、agent には内容の判断だけを残す。閾値、上限、並び順、節の切り出し、必須集合の充足は前者に当たり、何を書くか、どれが同じ共通項かは後者に当たる。skill の散文が閾値を述べていると、実行のたびに解釈が揺れ、テストからも掛けられない。

## 定型手順

1. skill が下す判定を並べ、同じ入力から同じ答えが出るものに印を付ける
2. 印の付いた判定を script へ移し、skill には呼び出しと、結果の各枝で何をするかだけを書く
3. skill の不変条件に「閾値は script が決める。この skill は判定しない」と書く
4. script の入出力をテストで固定し、閾値を変えると落ちることを確認する
5. `allowed-tools` に script を呼ぶ許可を書き、呼び方と許可の形を一致させる

## 参照コード

- `skills/scribe/scripts/triage.py` の `EVIDENCE_THRESHOLD` と `PAGE_CAP` (閾値と 1 回あたりの上限を skill でなく script が持つ)
- `skills/issue/scripts/pick-plan.py` の `rank` (下書きの選定を、共通語の得点という決まった計算にする)
- `skills/issue/scripts/validate-issue-body.py` の `FLOOR` (種別ごとの必須節を、骨格が何を求めるかと別に持つ)
- `skills/scribe/scripts/find_wiki_rule.py` の `find` (該当ページの絞り込みを glob の照合で行う)
- `skills/dr/scripts/validate-dr.py` の `STATUS_VALUES` (status が lifecycle の値の中にあるかを検査する)

## 根拠

- #210 skill の散文が持っていたサイズ判定を script へ出した
- #220 判定を script に置き、内容の判断だけを agent へ渡す形にした
- #222 同じ形を別の skill へ広げた
- #230 閾値を skill の散文から外した
- #389 issue の plan 選定と節の切り出しを pick-plan.py へ出し、種別ごとの必須節を FLOOR として validator に持たせた。移す過程で「slug が issue のタイトルに一致する」という前提が崩れ、実行で確かめられる形にして初めて分かった
