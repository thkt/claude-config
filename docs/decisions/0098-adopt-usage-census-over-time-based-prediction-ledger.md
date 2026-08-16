---
status: "accepted"
date: 2026-08-13
decision-makers: thkt
---

# ADR-0098: 機構の退役判断に時間ベースの予測台帳ではなく使用センサスを採る

## Context and Problem Statement

採用した機構が使われないまま数か月放置され、削除に至るまで気付く経路が無い。実測 2 件。`hooks/lifecycle/context-monitor.sh` は 2026-03-09 導入から 2026-07-26 の配線外しまで 139 日、`skills/use-cli-heptabase` は 2026-04-26 前後から 2026-07-26 の削除まで約 91 日かかり、削除時に手作業で 30 日分の transcript を走査して「生涯 3 回/最終使用 2026-06-04」を数えた。

`docs/decisions/` の DR は 98 件、うち Reassessment Triggers 節を持つのは 42 件ある。条件を書いた本人が後で戻ってくる仕組みは無い。採用時に書いた予測を期限到来時に回収する台帳を置くべきか。

## Decision Drivers

- 発火トリガーを決定論で書けること。`hooks/lifecycle/reflection-ask.sh` は LLM が発話タイミングを判断する形で失敗し、無効化して再設計待ちのまま残っている
- 出力の consumer が定義されていること。`.claude/OUTCOME.md` は人間の検証コストを判断が必要な残余だけに絞ると定めている
- 計測できる対象だけを対象にすること

## Considered Options

- Option A: 使用センサス単体。transcript から skill の呼び出し回数と最終使用日を集計し、人間の退役判断の入力にする
- Option B: 時間ベースの予測台帳。DR frontmatter に `review-after` を足し、無ければ date + 180 日を期限として期限到来分を列挙する
- Option C: Option B に月次 cron を足し、期限到来分があれば GitHub issue を 1 本立てる

## Decision Outcome

Option A を採用する。Option B と C が置く時間軸は、この repo で実測された気付きのレイテンシより遅い。

決定的な反例が ADR-0056 にある。同 DR は `use-cli-heptabase` を load-bearing として維持する判断を記録し、再評価条件に「残り 5 つの `use-cli-*` skill のいずれかも load-bearing でないと判明した時」を挙げた。この条件は 2026-07-26 に成立している。frontmatter は `date: 2026-04-29` なので、180 日基準では 2026-10-26 に鳴る。捕まえるべきイベントの 3 か月後になる。

動機となった 2 件も両方 180 日未満で人間が気付いて処理済みなので、時間軸は解決済みの問題を後から通知する。トリガー本文の側も「aggregation rate が 20% を下回る」(ADR-0043)、「hook pipeline の合計実行時間が 5 秒を超えた」(ADR-0038) のように、人間が別途計測しないと真偽が決まらない条件が多い。期限リストを配ると検証コストは減らず、測る場所が移るだけになる。

センサスの対象は skill に限る。frontmatter に `agent` フィールドを持つ wrapper 8 件は Skill ツール経由で呼ばれないので対象から外す。

### Consequences

- Good, because 手作業だった transcript 走査が 1 コマンドになり、退役判断の入力が再現可能になる
- Good, because 発火機構を持たないので、`reflection-ask.sh` と同じ「無視される通知」にならない
- Bad, because 意図的に低頻度な skill (`census`, `outcome`, `scribe` など) が毎回並び、人間が同じ判断を繰り返す
- Bad, because 予測の回収そのものは達成しない。DR に書いた条件は引き続き人間が思い出す必要がある

### Confirmation

センサス skill の seam テストが、`agent` フィールドを持たず呼び出しが 0 回の skill を未使用一覧に載せ、`agent` フィールドを持つ wrapper を載せないことを固定する。未使用が何件あっても exitCode は 0 を返す。skill 名は thkt/dotclaude#376 の着手時に確定する。

## Pros and Cons of the Options

### Option B

DR frontmatter の期限で発火する。

- Good, because 条件本文を書いた DR が全部拾える
- Bad, because ADR-0056 の実例で 3 か月遅れる。2026-08-13 時点で 180 日超の accepted DR は 5 件のみで、そのどれも Reassessment Triggers 節を持たない

### Option C

Option B に月次 cron を足す。

- Good, because 実行忘れが起きない
- Bad, because 通知はゲートではない。`.claude/rules/CORRECTIONS.md` は手動統合バックログとして 13 エントリが未統合のまま積まれている

## More Information

### Trade-offs

計測できない対象を切り落として範囲を狭めた。hook の未発火は検出しない。transcript 1462 ファイル (30 日窓) を走査して、hook 実行を表す `tool_use` ブロックは 0 件だった。取れるのは Skill、Agent、Workflow の呼び出しだけなので、動機 2 件のうち `context-monitor.sh` 側はこの決定では捕まらない。計測点を配線側に置く別設計が要る。

agent も対象外にした。`workflows/audit.js:628` が `agentType` を `reviewer-${u.reviewer}` の形で組み立て、ROUTING テーブル (`workflows/audit.js:204`) には `"security"` という裸の文字列で載る。名前で grep しても出ず、該当拡張子の diff を audit していなければ transcript にも出ないので、静的参照と使用回数が同時に取りこぼす。

### Reassessment Triggers

- センサス出力を見て退役させた skill が 6 か月で 0 件のとき。判断の入力として使われていない
- hook の未発火を配線側で計測する手段ができたとき。対象を hook へ広げる
- transcript の保持期間が 30 日を下回ったとき。集計窓が成立しなくなる
