---
status: "accepted"
date: 2026-07-25
decision-makers: thkt
---

# ADR-0088: build の実装を unit ごとにコミットし、plan のアンカーを trailer に載せる

## Context and Problem Statement

build は Code phase で全 unit を実装し、Ship phase で作業ツリー全体を 1 コミットにまとめていた。この形では draft PR のレビュー単位が build 1 回分になり、U-NNN と実装の対応、T-NNN と実装の対応が git 履歴に残らない。対応は PR body の fact tail にしか存在せず、コミット単位の bisect もできない。

一方、後追いでコミットを分割することはできない。Ship の時点で作業ツリーは全 unit と Cleanup (simplify) の編集が混在しており、hunk をどの unit に帰属させるかは LLM の推測になる。build は決定論の検証を積み上げてきた workflow (ADR-0085) なので、ここに推測を入れると設計と逆行する。unit の境界が確実に既知なのは code.js の各 unit 完了直後、working tree がその unit の作業だけを持っている瞬間だけである。

さらに、unit ごとにコミットすると HEAD が分岐点から動く。build.js の Verify は 3 つの review (diff-files / conformance / structure) がいずれも `git diff HEAD` を基準にしており、conformance のプロンプトには「HEAD is still the branch point」と明記されていた。基準を変えないまま unit コミットを入れると、これらの差分が空になり、scope 逸脱 0 件・conformance findings 0 件という無言の pass になる。Verify は fail-open 設計なので、この破壊は stopped 値にも log にも現れない。

## Decision Drivers

- レビュー単位と bisect 単位を unit に合わせ、U-NNN / T-NNN の対応を git 履歴に残す
- 帰属の推測を入れない。コミットは unit 境界が確実に既知な瞬間にのみ取る
- Verify の 3 review が実効を保つ。HEAD が動いても比較対象を失わない
- コミットメッセージに issue 由来 (untrusted) の文をそのまま流し込まない
- Ship の staging ガード (`git add -A` 禁止、pre-existing untracked の除外) をコミット地点が増えても維持する

## Considered Options

- Option A: code.js の unit ループ内でコミットし、build.js は Branch で捕まえた分岐点 sha を diff 基準にする (採用)
- Option B: Ship で作業ツリーを unit ごとに分割してコミットする
- Option C: 現状維持 (build 1 回 = 1 コミット)。粒度は PR body の fact tail で代替する
- Option D: unit ごとに Red コミットと Green コミットの 2 つを積む

## Decision Outcome

Option A を採用する。

コミット地点は code.js の unit 完了直後 3 箇所 (直接実装 / Red 未確認 / Red → Green)。unit ごとに `commit:U-NNN` agent (haiku) を 1 体起動する。コミットは opt-in (`args.commit`) とし、build だけが有効化する。単独起動の code は従来どおり作業ツリーを未コミットのまま残す。

コミットメッセージは subject 行だけを agent が書き (Conventional Commits、staged diff から)、本文は script が plan から決定論に組み立てたブロックを逐語コピーさせる。本文は goal + trailer 群 (`Unit:` / `Contract:` / `Tests:` / `Seam:` / `Issue:`)。agent の prompt 文をそのまま載せない理由は 2 つある。prompt には issue 由来の untrusted な文が混ざる (build.js は issue body を data fence で囲んでいる) が、コミットメッセージは改変不能な記録であること。もう 1 つは trailer 形式なら `git interpret-trailers` / `git log --format` で機械的に再取得できることである。

build.js 側は Branch phase の checkout agent に `git rev-parse HEAD` を実行させ、分岐点 sha を BRANCH_SCHEMA の `head` として受け取る。Verify の 3 review はこの sha を基準にする (`git diff <sha>`) ので、コミット済みの unit と未コミットの Cleanup 編集の両方が 1 つの diff に入る。merge-base ではなく実測 sha を使うのは、base ブランチ名の推測を挟まず、epic ブランチ起点 (`args.base`) の flow でも同じ式が成立するからである。sha が sha の形をしていないときは unit コミットを無効化し、`git diff HEAD` 基準の従来経路へ退避する。比較対象を失ったまま検証を素通りさせないための fail-safe である。

staging は Ship と同じ規則を commit agent 側に複製する。`git add -A` / `git add .` の禁止に加え、Revalidate で採取した baseline untracked 一覧を never-stage 集合として渡す (build → code の `untracked_baseline`)。コミット失敗 (pre-commit gate のブロック、ADR-0064) は stop でなく `kind: "uncommitted"` の anomaly とし、作業はツリーに残して Ship の残余コミットが拾う。Ship は unit コミットがある場合、残余がゼロなら commit 自体を skip して push へ進む。

Option B を却下した理由は上述の帰属推測にある。Option C は PR body の fact tail が build 単位でしか対応を持てず、bisect もできないため、レビュー粒度の問題が残る。Option D は Red コミットが必ず赤い状態を履歴に残し、bisect の各点が緑という性質を壊すため退けた。

### Consequences

- Good, because レビュー単位と bisect 単位が unit になり、U-NNN / T-NNN / contract の対応が git 履歴から機械的に取れる
- Good, because Verify の基準が実測 sha になり、コミットの有無に関係なく「分岐点以降のすべて」を 1 つの式で表せる
- Good, because 途中で停止しても、それまでの unit がコミット済みで残り、復旧の手がかりになる (従来は汚れた作業ツリーだけが残った)
- Bad, because unit ごとに commit agent 1 体 (haiku) が増え、ADR-0064 の always-rerun pre-commit gate がコミットごとに 3-30s 同期ブロックする。5 unit で最大 2.5 分の追加
- Bad, because squash merge するリポジトリでは粒度がマージ時点で消え、便益は draft PR のレビュー中に限られる
- Bad, because staging ガードが Ship と commit agent の 2 箇所に存在し、片側だけ更新すると乖離する。結合はコメント明記のみで守る

### Confirmation

`workflows/code/tests/code.commit.test.js` が、`commit: true` で unit ごとに commit agent が実装順に 1 回ずつ走ること、prompt が plan 由来の trailer ブロック (Unit / Contract / Tests / Seam / Issue) を逐語コピー指示付きで運ぶこと、`issue` が `#` 付きでも trailer が `#` を重ねないこと、`git add -A` 禁止と `untracked_baseline` の never-stage が prompt に載ること、コミット失敗 (`committed: false` / null) が stop でなく `kind: "uncommitted"` の anomaly になること、tests 空の直接実装 unit と Red 未確認 unit もコミット対象になること、`commit` 未指定なら commit agent が 0 回であること、`unit-failed` の終端 return にも `commits` が載ることを検証する。

`workflows/build/tests/build.behavior.test.js` が、Verify の diff-files / conformance / structure が分岐点 sha を基準にし素の `git diff HEAD` を含まないこと、code へ `commit: true` / `issue` / `untracked_baseline` が渡り戻り値 `unit_commits` に件数が載ること、`head` が sha でないとき `commit: false` へ退避し diff 基準が HEAD へ戻ること、unit コミット有効時の Ship prompt が残余コミット指示になることを検証する。

## More Information

- ADR-0085 の選択ベース検証 (Verify は plan のアンカーとの比較) を変えるものではない。基準となる diff の取り方だけを変える
- ADR-0064 の always-rerun pre-commit gate がコミット回数に比例してコストを増やす。unit 数が増えると Code phase の実時間に効く
- staging ガードは `workflows/build.js` の Ship prompt と `workflows/code.js` の `commitUnit` の 2 箇所。片方を変えるときはもう片方も同一コミットで揃える (Premise)
