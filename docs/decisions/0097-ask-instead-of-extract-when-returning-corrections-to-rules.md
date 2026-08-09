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
- Good, because 答えの置き場所が `rules/` 配下なので、`InstructionsLoaded` の対象として毎セッション context に入る
- Bad, because 答えを受けて規則に書く動作は文言で拘束するだけで、書くかどうかの裁量は残る
- Bad, because ターンの区切りは作業の区切りとは限らず、作業途中で問われる回が出る

### Confirmation

`hooks/lifecycle/reflection-ask.sh` が Stop hook に配線され、`systemMessage` に問いを載せて返すこと。同スクリプトが LLM を起動しないこと (`claude` を呼ぶ行を持たないこと) をコードレビューで確認する。debounce のタイムスタンプが更新され、同一 window 内の 2 回目以降が無出力で終わることをテストで確認する。

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

`hooks/lifecycle/reflection-ask.sh` と規則ファイル `rules/CORRECTIONS.md` を追加し、`settings.json` の Stop へ配線する。配線は sandbox の書込拒否対象なので `update-config` skill が担う。旧実装の資材はリポジトリに残っていないため移行対象は無い。

### Review Schedule

配線から 1 か月後に `rules/CORRECTIONS.md` の追記件数を数える。ゼロなら問いが届いていないか、届いても答えが書かれていない。どちらであるかは transcript の問い出現回数と突き合わせて判別する。

### Reassessment Triggers

- 問いが出た回のうち、規則へ何も書かれない回が続く。文言による拘束では書く動作を起こせないので、書き込みまで機構化する方法を検討する
- 作業途中で問われる煩わしさが debounce の間隔調整で収まらない。発火点を PR 作成時などの作業の区切りへ移す
