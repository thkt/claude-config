---
status: "accepted"
date: "2026-08-09"
decision-makers: "thkt"
---

# Ask instead of extract when returning corrections to rules

## Context and Problem Statement

セッション中に受けた訂正が永続規則へ戻る経路が動いていない。2026-05-31 に Stop hook の LLM reflection 抽出を無効化して以来、代替は `/scribe` や `/dr` を人間が思い出して打つ運用で、想起しなかった回の訂正はそのセッションで消える。訂正を残す動作を、想起でなく機構で起こすにはどうするか。

## Decision Drivers

- 発火が裁量に依存しないこと。OUTCOME の Behavior が求める条件
- 旧実装の失敗を繰り返さないこと。LLM 抽出は一度も成功せず空 placeholder を 492 個量産した
- 毎ターンの課金とレイテンシを増やさないこと。修正済みスクリプトの有効化を止めた理由がこれ

## Considered Options

- 問いを強制発火させ、何を残すかは人間が選ぶ
- LLM に抽出させ、結果を自動で書く (旧実装の再有効化)
- `/scribe` を思い出して打つ運用を続ける (現状維持)

## Decision Outcome

Chosen option: "問いを強制発火させ、何を残すかは人間が選ぶ", because 発火を機構が担い、内容の判断を人間が担うことで、旧実装が失敗した箇所だけを人間に戻せる。

抽出する LLM 呼び出しが無くなるため subprocess が要らず、旧実装の有効化を止めていた毎ターン 17 秒から 83 秒のブロックと課金も同時に消える。

### Consequences

- Good, because 想起に依存せず、訂正を残すかどうかの判断が毎セッション必ず 1 度は本人に届く
- Good, because 問うだけなので hook の所要時間が数ミリ秒に収まり、旧実装で退行の原因だったレイテンシが構造的に発生しない。Stop で会話が継続するのは `decision: "block"` を返した場合に限られ、`systemMessage` と `additionalContext` はターンを増やさない
- Good, because 答えの置き場所が `.claude/rules/` 配下なので、`InstructionsLoaded` の対象としてこのリポジトリで作業するセッションの context に入る。他のリポジトリでは読まれない
- Bad, because 答えを受けて規則に書く動作は文言で拘束するだけで、書くかどうかの裁量は残る
- Bad, because ターンの区切りは作業の区切りとは限らず、作業途中で問われる回が出る

### Confirmation

`hooks/lifecycle/reflection-ask.py` が Stop hook に配線され、`additionalContext` に問いを載せて返すこと。問いは agent に宛てたものなので、`systemMessage` へ載せると同じ 700 字が端末へ出てターン自身の答えを埋める。同スクリプトが LLM を起動しないこと (`claude` を呼ぶ行を持たないこと) をコードレビューで確認する。直前に尋ねた session_id が記録され、同一セッション内の 2 回目以降が無出力で終わることをテストで確認する。

## Pros and Cons of the Options

### 問いを強制発火させ、何を残すかは人間が選ぶ

Stop hook が debounce つきで問いを出し、答えを受けて規則ファイルへ書く。

- Good, because 抽出の失敗モード (空の結果を成果として書く) が構造的に起きない
- Good, because 発火の判断に LLM が関与しないため、hook が動く限り必ず問われる
- Bad, because 人間が答えない回は何も残らない。発火は保証されるが記録は保証されない

### LLM に抽出させ、結果を自動で書く

無効化した実装を、root cause 修正済みの形で再有効化する。

- Good, because 人間の応答を待たずに記録が溜まる
- Bad, because 2026-05-31 までの実績が空 placeholder 492 個。抽出の質を測る手段が無いまま書き込みだけが進む
- Bad, because 毎ターン haiku を起動するため 17 秒から 83 秒のブロックと課金が乗る。大きな transcript では 25 秒の timeout に当たり、placeholder へのフォールバックが旧バグと区別できない

### 現状維持

`/scribe` と `/dr` を人間が打つ。

- Good, because 追加の機構が要らない
- Bad, because 想起した回しか残らない。2026-08-09 のセッションでは 5 つの hook が同じパス依存を持っていたが、これは一度直した判断が次の実装に伝わらなかった結果

## More Information

### Before / After comparison

変更前は、訂正を残す動作の起点が人間の想起だった。変更後は Stop hook が問いを出し、人間は残すかどうかを答える。答えの内容は変更の前後どちらも人間が決める。

### Transition Plan

`hooks/lifecycle/reflection-ask.sh` と規則ファイル `.claude/rules/CORRECTIONS.md` を追加し、`settings.json` の Stop へ配線する。配線は sandbox の書込拒否対象なので `update-config` skill が担う。旧実装の資材はリポジトリに残っていないため移行対象は無い。

### Review Schedule

`.claude/rules/CORRECTIONS.md` から規則ファイルへ移った行数を数える。追記件数は数えない。追記だけを数えると、ファイルが待ち行列として詰まっていく間も数字が伸び続け、失敗が検出できない。

### Reassessment Triggers

- 統合が発火しても規則ファイルへ何も書かれない回が続く。蒸留の判断を subagent に任せる形が働かないので、統合先ごとの受け皿を先に用意する方法を検討する
- 作業途中で問われる煩わしさが debounce の間隔調整で収まらない。発火点を PR 作成時などの作業の区切りへ移す

### Trigger fired: 2026-08-14

1 つ目の Reassessment Trigger が発火した。配線から 4 日で 31 エントリ積み、規則ファイルへ移った行は 0 だった。原因は想起ではなく、hook が統合を一度も要求していなかったこと。この決定は追記の発火だけを機構化し、規則ファイルへ移す動作を `CORRECTIONS.md` の「折を見て」という文言に委ねていた。文言による拘束では書く動作を起こせない、というこの DR 自身の Bad consequence がそのまま現れた。

`hooks/lifecycle/reflection-ask.sh` が対象列を集計するようになり、同じ対象を指す行が 3 行以上溜まっていれば、その対象への統合まで同じ subagent へ指示する。閾値は対象ごとに見るので、蒸留に値するだけ育ったクラスタが発火する。1 回に発火するのは最大の 1 対象に限り、ターンの長さを抑える。

同時に `CORRECTIONS.md` 自身の矛盾も外した。「統合済みの行はここから消す」と「教訓が適用済みであることは削除の理由にならない」が両方とも無条件で書かれており、後者が前者を打ち消していた。削除の対象を「対象ファイルへ書いた内容の行」へ、削除の禁止を「対象ファイルへまだ移していない行」へ、それぞれ限定した。
