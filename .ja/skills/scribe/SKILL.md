---
name: scribe
description: 過去の closed PR / issue と .claude/workspace/research/ の調査結果から繰り返しの共通項を抽出し、最新コードと突き合わせて docs/wiki/ に PR で提案する。
when_to_use: scribe 実行, wiki 抽出, 共通項の蒸留, PR/issue からの知見蓄積, research 成果の蓄積, run scribe, wiki extraction, distill recurring patterns
allowed-tools: Bash(git:*) Bash(gh:*) Bash(find:*) Bash(python3:*) Read Write Edit LS
---

# /scribe - PR / issue / research 共通項の wiki 蓄積

拾う共通項は、定型手順や規約として繰り返される手順と、再発する指摘や失敗のパターン。1 度きりの個別事情と、設計判断そのものは拾わない。

## 不変条件

| 条件                | 内容                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| PR 経由             | デフォルトブランチへ直接コミット / プッシュしない                                                                                            |
| 進捗の記録          | cursor は最後にマージされた scribe PR の mergedAt。research ファイルはその mergedAt と最終コミット時刻を比べる                                        |
| 閾値の所在          | ページにするか候補に置くかの判定は `scripts/triage.py` が持ち、この skill は判定しない                                                       |
| 事実のみ            | PR / issue と research ファイルに書かれた事実、および現在のコードで確認できた事実のみ書く。推測で埋めない                                    |
| research は引かない | `.claude/workspace/research/` のファイルパスを `docs/wiki/` 配下に書かない。wiki は蒸留した共通項を置く場所で、パスは読者を原資料へ送り返す                    |
| worktree 隔離       | 編集 / commit は隔離 worktree 内で行い、ユーザーの作業ツリーを動かさない。worktree を作るのは Phase 6 なので、書き込む Phase は Phase 6 だけ |

## Phase 1: 前提確認とオンボーディング

1. `gh pr list --label scribe --state open --limit 1` で未マージの scribe PR を確認する。あれば追い越さず、中断して報告する
2. `docs/wiki/README.md` が無ければ ${CLAUDE_SKILL_DIR}/templates/readme.md の内容を用意する
3. `docs/wiki/_candidates.md` が無ければ ${CLAUDE_SKILL_DIR}/templates/candidates.md の内容を用意する。手順 2 と合わせ、書き込みは Phase 6 の worktree 内で行う
4. scribe ラベルが無ければ `gh label create scribe --description "scribe による wiki 提案"` で作成する

## Phase 2: スコープ決定

1. 最後にマージされた scribe PR の mergedAt を `gh pr list --label scribe --state merged --limit 1 --json mergedAt -q '.[0].mergedAt'` で取得する
2. mergedAt が取れなければ初回。`gh pr list --state merged --search '-label:scribe'` と `gh issue list --state closed` の全件、および `find .claude/workspace/research -name '*.md'` の全件を対象にする
3. mergedAt が取れたら差分だけを対象にする。PR は `gh pr list --state merged --search "-label:scribe merged:><mergedAt>"` で集める。issue は `gh issue list --state closed --search "closed:><mergedAt>"` で集める。調査ファイルは `git log --since="<mergedAt>" --name-only --diff-filter=AM --pretty=format: -- '.claude/workspace/research/*.md' | sort -u` で集める。これに未追跡分の `git ls-files --others --exclude-standard -- '.claude/workspace/research/*.md'` を加える。未コミットのレポートは git log に載らず、それこそローカル run が持っていやすい 1 件になる
4. research の対象は `*.md` だけとし、他の形式は読まない。cursor には各ファイルの最終コミット時刻を使い、mtime とファイル内の `Generated:` 行は使わない。checkout は内容の変更時期と無関係に mtime を checkout 時刻へ戻すので、mtime では比較の基準にならない。`Generated:` は生成時の日付で、後から追記してもその日付のままなので、更新を取りこぼす
5. PR/issue/research のいずれも 0 件でも、`docs/wiki/_candidates.md` に根拠 2 件以上の行があれば Phase 3 へ進む。その行も無いときだけ「新規なし」と報告して終了する

## Phase 3: 抽出

1. `docs/wiki/*.md` を読み、既存ページを把握する。`kind: structure` を持つページは共通項ではないので、名前が一致しても `existing: "none"` のままにする
2. スコープの各 PR/issue を `gh pr view <番号> --comments`/`gh issue view <番号> --comments` で本文/コメントまで読む
3. スコープの各 research ファイルを Read で全文読む。セクション名で絞らない
4. 読んだ内容を共通項ごとにまとめ、配列へ足す。同じ共通項が配列にあれば根拠だけを足す。設計判断とその経緯は `docs/decisions/` の領分なので対象外
5. `docs/wiki/_candidates.md` を読み、配列の共通項が既存の候補行と同じものを指すなら、その行の本文をそのまま `name` に使う
6. その配列を `python3 ${CLAUDE_SKILL_DIR}/scripts/triage.py '<共通項の JSON 配列>' docs/wiki/_candidates.md` に渡す。script が `_candidates.md` の両方の節から候補行を読んで配列へ混ぜ、閾値 2 件と 1 回あたりのページ上限を当て、`pages` (新規/昇格/更新)、`candidates`、`deferred` (今回は見送り) に分ける。閾値と上限を自分で判定しない
7. `docs/wiki/_candidates.md` を書き換える形を用意する。`candidates` は「単発」節へ、`deferred` は「昇格待ち」節へ置き、`pages` になった共通項の行は消す。行は `- <内容 1 行> <根拠>` の形にし、根拠は `#番号` と `(research)` をスペース区切りで並べる。既に行があれば根拠だけを足す。書き込みは Phase 6 の worktree 内で行う

| フィールド | 値                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| `name`     | 共通項の同一性を決めるキー。候補行から来たものは行の本文がそのまま入る。ページのファイル名は Phase 6 で決める |
| `evidence` | 根拠の配列。PR/issue 由来は `#番号`、research 由来は `(research)`                                             |
| `existing` | 既存ページにあれば `page`、`_candidates.md` にあれば `candidate`、無ければ `none`                             |

## Phase 4: 最新コードとの突き合わせ

ページ化/昇格/更新の前に、各共通項を現在のコードと突き合わせる。この Phase で決めるのは書く内容で、ファイルへの書き込みは Phase 6 の worktree 内でまとめて行う。

1. 成立を確認した項目に、現行コードの位置を参照コードとして `path` + シンボル名で付記する。行番号は書かない
2. その決まりごとが効く実装ファイルの glob と、`find_wiki_rule.py` の `SCENES` 定数から選ぶ scenes を決める。両者は独立した判定になる。glob は実装ファイルを、scenes は場面を指し、起票や PR の運用に閉じる決まりごとは glob が空配列のまま scenes を持つ
3. 今回のスコープに関係しない既存ページも含め、`docs/wiki/*.md` 全ページの参照コードを掃除する。ファイルの存在と、ファイル内でのシンボル名の grep 一致を機械的に確認する
4. 壊れていた参照は現行コードを読み直す。決める内容は下表による
5. 落とした項目が `_candidates.md` に行を持つとき、その行を「棄却」節へ移し、次の行に落とした理由をインデントして書く。Phase 3 手順 7 が用意した削除より優先する

| 確認                                                | 不成立のときに決める内容                         |
| --------------------------------------------------- | ------------------------------------------------ |
| 規約 / 手順が現在の実装でも成立するか               | 落とす。既存ページの項目なら不成立と書き直す文面 |
| 構造ページの記述が現在の実装と一致するか            | 現行コードに合わせて書き直す文面。落とさない     |
| lint / hook / CI ですでに機械的に強制されていないか | 落とす                                           |
| 参照するパス / コマンドが現存するか                 | 現行のパス / コマンドへの張り替え先              |

## Phase 5: 由来リンクの判定

ページ化/昇格/更新するページでは、共通項が `docs/decisions/` の特定 DR の決定から派生している場合に限り、「由来」節に DR のファイルパスを書く。判定は反事実テスト「その DR が supersede されたらこのページは書き換えが必要になるか」で、Yes のときだけ張る。1 ページに 3 本以上並んだら各リンクへ反事実テストを再適用し、No になったものを外す。

あわせて、既存ページも含めた全ページの由来リンクを点検する。DR ファイルの実在と status を確認し、superseded なら後継 DR を読む。共通項が引き続き成立する場合は由来の張り替え先を後継に決め、成立しない場合は不成立として書き直す内容を決める。ここでも書き込みは Phase 6 で行う。

## Phase 6: PR 作成

扱うページは Phase 3 の `pages` に限り、`deferred` は PR 本文に残しとして明記する。参照修理と由来修理は上限の外なので、`pages` が 0 件でも実施する。候補への追記だけでも PR を作り、変更が何も無いときだけ作らない。

1. `git fetch origin <デフォルトブランチ>` の後、`origin/<デフォルトブランチ>` から隔離 worktree とブランチ `scribe/<yyyymmdd-HHMMSS>` を作る
2. worktree 内で Phase 3-5 が決めた内容を書き込む。ページは ${CLAUDE_SKILL_DIR}/templates/page.md の骨格に従い、候補行は Phase 3 手順 7 の形で `_candidates.md` へ、参照修理と由来修理は Phase 4-5 が決めた張り替え先で書く
3. `commits` の要素を先頭から順にコミットする。1 コミット目は自分が含むページに加え `_candidates.md` の更新と参照修理・由来修理も `git add` し、残りの要素は自分が含むページだけを `git add` する。要素ごとにメッセージ `docs(wiki): <要素内の共通項名, ...> を追加/更新` で 1 要素 1 コミットする
4. `python3 ${CLAUDE_SKILL_DIR}/scripts/verify_run.py <worktree> <base>` を実行し、Phase 3 の report JSON を stdin へ渡す。`<base>` は手順 1 で分岐した `origin/<デフォルトブランチ>`。昇格待ちの行数と期待コミット数は script が report から読むので、自分で数えない。`ok` が true であることを確認し、false なら手順 5 へ進まない
5. push して `gh pr create --base <デフォルトブランチ>` を実行する。タイトル `[scribe] <共通項名, ...> を追加/更新`、ラベル scribe。本文には追加/昇格/更新したページをコミットごとに分けて並べ、候補への追記、参照修理/由来修理したページ、読んだ PR/issue の範囲と research の件数、検証で落とした項目、打ち切った残しを書く
6. worktree を削除する
7. 手順 4 が false を返したときは worktree を残す。書き込みをやり直せる状態にしておく。手順 5 以降が失敗したときは `git worktree remove --force <worktree>` と `git branch -D scribe/<yyyymmdd-HHMMSS>` を実行し、worktree とローカルブランチを残さない
