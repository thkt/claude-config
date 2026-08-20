---
name: scribe
description: 過去の closed PR / issue と .claude/workspace/research/ の調査結果から繰り返しの共通項を抽出し、最新コードと突き合わせて docs/wiki/ に PR で提案する。
when_to_use: scribe 実行, wiki 抽出, 共通項の蒸留, PR/issue からの知見蓄積, research 成果の蓄積, run scribe, wiki extraction, distill recurring patterns
allowed-tools: Bash(git:*) Bash(gh:*) Bash(find:*) Bash(python3:*) Read Write Edit LS
---

# /scribe - PR / issue / research 共通項の wiki 蓄積

拾う共通項は、定型手順や規約として繰り返される手順と、再発する指摘や失敗のパターン。1 度きりの個別事情と、設計判断そのものは拾わない。

## 不変条件

| 条件          | 内容                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| PR 経由       | デフォルトブランチへ直接コミット / プッシュしない                                                                  |
| 進捗の記録    | cursor は最後にマージされた scribe PR の mergedAt。research ファイルはその mergedAt と mtime を比べる              |
| 閾値の所在    | ページにするか候補に置くかの判定は `scripts/triage.py` が持ち、この skill は判定しない                             |
| 事実のみ      | PR / issue と research ファイルに書かれた事実、および現在のコードで確認できた事実のみ書く。推測で埋めない          |
| research は引かない | `.claude/workspace/research/` のファイルパスを `docs/wiki/` 配下に書かない。workspace は追跡外で、wiki を読む人が辿れない |
| worktree 隔離 | 編集 / commit は隔離 worktree 内で行い、ユーザーの作業ツリーを動かさない。worktree を作るのは Phase 6 なので、書き込む Phase は Phase 6 だけ |

## Phase 1: 前提確認とオンボーディング

1. `gh pr list --label scribe --state open --limit 1` で未マージの scribe PR を確認する。あれば追い越さず、中断して報告する
2. `docs/wiki/README.md` が無ければ ${CLAUDE_SKILL_DIR}/templates/readme.md の内容を用意する
3. `docs/wiki/_candidates.md` が無ければ ${CLAUDE_SKILL_DIR}/templates/candidates.md の内容を用意する。手順 2 と合わせ、書き込みは Phase 6 の worktree 内で行う
4. scribe ラベルが無ければ `gh label create scribe --description "scribe による wiki 提案"` で作成する

## Phase 2: スコープ決定

1. 最後にマージされた scribe PR の mergedAt を `gh pr list --label scribe --state merged --limit 1 --json mergedAt -q '.[0].mergedAt'` で取得する
2. mergedAt が取れなければ初回。`gh pr list --state merged --search '-label:scribe'` と `gh issue list --state closed` の全件、および `find .claude/workspace/research -name '*.md'` の全件を対象にする
3. mergedAt が取れたら差分だけを対象にする。PR は `gh pr list --state merged --search "-label:scribe merged:><mergedAt>"` で集める。issue は `gh issue list --state closed --search "closed:><mergedAt>"` で集める。調査ファイルは `find .claude/workspace/research -name '*.md' -newermt "<mergedAt>"` で集める
4. research の対象は `*.md` だけとし、他の形式は読まない。cursor には mtime を使い、ファイル内の `Generated:` 行は使わない。`Generated:` は生成時の日付で、後から追記してもその日付のままなので、更新を取りこぼす
5. PR/issue/research のいずれも 0 件でも、`docs/wiki/_candidates.md` に根拠 2 件以上の行があれば Phase 3 へ進む。その行も無いときだけ「新規なし」と報告して終了する

## Phase 3: 抽出

1. `docs/wiki/*.md` を読み、既存ページを把握する
2. `docs/wiki/_candidates.md` の候補行を両方の節から全て読み、1 行ごとに `{name, evidence, existing: "candidate"}` として配列へ入れる。上限で持ち越した行が戻る経路はここだけ
3. スコープの各 PR/issue を `gh pr view <番号> --comments`/`gh issue view <番号> --comments` で本文/コメントまで読む
4. スコープの各 research ファイルを Read で全文読む。セクション名で絞らない
5. 読んだ内容を共通項ごとにまとめ、配列へ足す。同じ共通項が配列にあれば根拠だけを足す。設計判断とその経緯は `docs/decisions/` の領分なので対象外
6. その配列を `python3 ${CLAUDE_SKILL_DIR}/scripts/triage.py '<共通項の JSON 配列>'` に渡す。script が閾値 2 件と 1 回あたりのページ上限を当て、`pages` (新規/昇格/更新)、`candidates`、`deferred` (今回は見送り) に分ける。閾値と上限を自分で判定しない
7. `docs/wiki/_candidates.md` を書き換える形を用意する。`candidates` は「単発」節へ、`deferred` は「昇格待ち」節へ置き、`pages` になった共通項の行は消す。行は `- <内容 1 行> <根拠>` の形にし、根拠は `#番号` と `(research)` をスペース区切りで並べる。既に行があれば根拠だけを足す。書き込みは Phase 6 の worktree 内で行う

| フィールド | 値                                                                            |
| ---------- | ------------------------------------------------------------------------------- |
| `name`     | 共通項の名前。ページ化されると kebab-case のファイル名になる                  |
| `evidence` | 根拠の配列。PR/issue 由来は `#番号`、research 由来は `(research)`              |
| `existing` | 既存ページにあれば `page`、`_candidates.md` にあれば `candidate`、無ければ `none` |

## Phase 4: 最新コードとの突き合わせ

ページ化/昇格/更新の前に、各共通項を現在のコードと突き合わせる。この Phase で決めるのは書く内容で、ファイルへの書き込みは Phase 6 の worktree 内でまとめて行う。

1. 成立を確認した項目に、現行コードの位置を参照コードとして `path` + シンボル名で付記する。行番号は書かない
2. その決まりごとが効く実装ファイルの glob を決める。実装中に届く決まりごとだけが glob を持ち、起票や PR の運用に閉じるものは空配列にする
3. 今回のスコープに関係しない既存ページも含め、`docs/wiki/*.md` 全ページの参照コードを掃除する。ファイルの存在と、ファイル内でのシンボル名の grep 一致を機械的に確認する
4. 壊れていた参照は現行コードを読み直す。決める内容は下表による

| 確認                                                | 不成立のときに決める内容                             |
| --------------------------------------------------- | ---------------------------------------------------- |
| 規約 / 手順が現在の実装でも成立するか               | 落とす。既存ページの項目なら不成立と書き直す文面     |
| lint / hook / CI ですでに機械的に強制されていないか | 落とす                                               |
| 参照するパス / コマンドが現存するか                 | 現行のパス / コマンドへの張り替え先                  |

## Phase 5: 由来リンクの判定

ページ化/昇格/更新するページでは、共通項が `docs/decisions/` の特定 DR の決定から派生している場合に限り、「由来」節に DR のファイルパスを書く。判定は反事実テスト「その DR が supersede されたらこのページは書き換えが必要になるか」で、Yes のときだけ張る。1 ページに 3 本以上並んだら各リンクへ反事実テストを再適用し、No になったものを外す。

あわせて、既存ページも含めた全ページの由来リンクを点検する。DR ファイルの実在と status を確認し、superseded なら後継 DR を読む。共通項が引き続き成立する場合は由来の張り替え先を後継に決め、成立しない場合は不成立として書き直す内容を決める。ここでも書き込みは Phase 6 で行う。

## Phase 6: PR 作成

扱うページは Phase 3 の `pages` に限り、`deferred` は PR 本文に残しとして明記する。参照修理と由来修理は上限の外なので、`pages` が 0 件でも実施する。候補への追記だけでも PR を作り、変更が何も無いときだけ作らない。

1. `git fetch origin <デフォルトブランチ>` の後、`origin/<デフォルトブランチ>` から隔離 worktree とブランチ `scribe/<yyyymmdd-HHMMSS>` を作る
2. worktree 内で Phase 3-5 が決めた内容を書き込む。ページは ${CLAUDE_SKILL_DIR}/templates/page.md の骨格に従い、候補行は Phase 3 手順 7 の形で `_candidates.md` へ、参照修理と由来修理は Phase 4-5 が決めた張り替え先で書く
3. メッセージ `docs(wiki): <共通項名, ...> を追加/更新` でコミットする
4. push して `gh pr create --base <デフォルトブランチ>` を実行する。タイトル `[scribe] <共通項名, ...> を追加/更新`、ラベル scribe
5. 本文には追加/昇格/更新したページ、候補への追記、参照修理/由来修理したページ、読んだ PR/issue の範囲と research の件数、検証で落とした項目、打ち切った残しを書く
6. worktree を削除する
