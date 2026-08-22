---
status: "deprecated"
date: "2026-08-09"
decision-makers: "thkt"
---

# Ask instead of extract when returning corrections to rules

> Deprecated 2026-08-21: 蒸留の発火条件が届かなくなった。`reflection_ask.py:43` の `BACKLOG_THRESHOLD = 3` は対象セルの文字列をそのまま数える。行の対象が散れば、何行溜まってもクラスタは育たない。2026-08-21 時点の 15 行は対象が全て異なり、最大クラスタは 1 件だった。発火したのは settings.json の 3 行が揃った 1 回だけで、`docs/HOOKS.md` § 5 へ蒸留した (PR #405)。同じ回に `CORRECTIONS.md`、`hooks/lifecycle/reflection_ask.py`、その prompt とテスト、settings.json の Stop 配線を削除した。残っていた 15 行は移さずに捨てた。後継 DR は無い。訂正を規則へ戻す経路は `/dr` と `/scribe` の手動運用に戻る。

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

`hooks/lifecycle/reflection-ask.py` が Stop hook に配線され、`additionalContext` に問いを載せて返すこと。問いは agent に宛てたものなので、`systemMessage` へ載せると同じ 700 字が端末へ出てターン自身の答えを埋める。直前に尋ねた session_id が記録され、同一セッション内の 2 回目以降が無出力で終わることをテストで確認する。

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

### Trigger fired: 2026-08-18

Confirmation の「`claude` を呼ぶ行を持たない」条項が、守るべきものを守らなくなった。この条項が禁じたのは LLM に抽出させて自動で書くことだが、2026-08-14 の変更で `## ask` が追記を subagent へ委ねた時点で、LLM が抽出して LLM が書く形になっている。条項が縛っていたのは、その LLM がどのプロセスで走るかだけだった。

#### 却下理由の再評価

却下した「LLM に抽出させ、結果を自動で書く」の理由 3 つを、分離した `claude -p` へ当てはめ直した。

| 却下理由                                  | 分離した `claude -p` で成立するか                                                            |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| 毎ターン 17 秒から 83 秒のブロック        | しない。`start_new_session` で切り離すので hook は数ミリ秒で返り、10 秒の timeout に届かない |
| 25 秒 timeout で placeholder へ退避       | しない。timeout が掛からず、退避先の placeholder も持たない                                  |
| 空 placeholder 492 個。抽出の質を測れない | する。しかも会話に 1 行も出なくなるので、旧実装より気付きにくい                              |

#### 分離の実装と計測

3 つ目だけが残り、気付く経路を別に用意する。子の stdout と stderr を `~/.cache/claude-reflection_ask/runs/<session>/log.txt` へ落とし、wrapper が終了コードを追記する。次のセッションの hook がその行を読み、`exit=0` でない run があれば `systemMessage` で 1 行だけ端末へ出す。報告した log は改名するので、同じ失敗は 1 度しか出ない。`additionalContext` でなく `systemMessage` を使うのは、対処できるのが端末を読む人間だからで、モデルの context は分離が空けたかった場所そのものだから。

分離を選んだのは Reassessment Trigger 2 の想定対処 (発火点を作業の区切りへ移す) では動機を満たさないため。動機は 3 つある。メインセッションの context を使わないこと、作業の途中で問われないこと、会話の末尾に報告行を残さないこと。発火点を移しても 1 つ目は残る。

子セッションは自分の Stop でこの hook を再び走らせ、その session_id は新しいので `_claim` を素通りする。sentinel ファイル `~/.cache/claude-reflection_ask/spawning` で再帰を止める。同じファイルが、同時に Stop した 2 セッションが 1 つの `CORRECTIONS.md` へ子を 2 体送る事態も止める。30 分の TTL を付けるのは、cleanup の前に死んだ子が sentinel を残して振り返りを黙って止めてしまうため。

気付く経路には未計測の前提が 1 つ残る。`systemMessage` が `suppressOutput: true` と同時に端末へ描画されるかは、2.1.233 で `additionalContext` について計測しただけで、`systemMessage` では確かめていない。描画されなくても失敗の記録は `runs/<session>/log.seen.txt` に残るので、経路が 1 本減るだけで証拠は失わない。

計測は 2.1.234 で行った。子セッションでも Stop hook は発火する。旧版で記録していた権限 default 強制 (`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`) は現行版には掛からない。

`--permission-mode acceptEdits` では追記先を書けない。`.claude/` 配下は sensitive file と判定され、Edit が `which is a sensitive file` で拒否される。`--settings` に `permissions.allow` で絶対パスを並べても上書きできず、通るのは `--permission-mode bypassPermissions` だけ。1 階層外の通常パスなら acceptEdits で書けるので、判定は権限モードでなく追記先の位置で決まる。

拒否されても CLI は exit 0 で終わる。そのため終了コードだけでは、仕事をした run と理由を述べただけの run を見分けられない。`_failures` は終了コードに加えて、ログに件数「追記 N 件」があるかを見る。書式は緩く受ける。prompt が「追記 N 件、削除 M 件、統合 K 件」の 1 行だけを求めても、子は「フォーマット済み。追記 1 件、削除 0 件、統合 0 件。」のように空白を詰めて前置きを付けた行を返す。拒否された run が返さないのは件数そのものなので、判定はそこだけに置く。

Edit を拒否された子は Bash へ回って同じファイルを書く。`--disallowedTools` で Bash を落とさないと、権限モードを絞っても書き込み経路は残る。ツール名は実在するものに限る。存在しない名前を渡すと `matches no known tool` の警告がログへ出る (`SlashCommand` が該当)。

`bypassPermissions` でも PreToolUse hook は発火し、`permissionDecision: deny` を返せば書き込みは止まる。外れるのは権限ルールと sensitive file の判定であって、guardrails の層ではない。`--allowedTools` は「確認なしで通すツール」の指定であってツール集合の制限ではないので、子は Bash も Agent も持つ。絞るには `--disallowedTools` を渡す。
