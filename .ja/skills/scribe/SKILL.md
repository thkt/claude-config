---
name: scribe
description: 過去の closed PR / issue と workspace/research/ の調査結果から繰り返しの共通項を抽出し、最新コードと突き合わせて docs/wiki/ に PR で提案する。
when_to_use: scribe 実行, wiki 抽出, 共通項の蒸留, PR/issue からの知見蓄積, research 成果の蓄積, run scribe, wiki extraction, distill recurring patterns
allowed-tools: Bash(git:*) Bash(gh:*) Bash(find:*) Read Write Edit LS
---

# /scribe - PR / issue / research 共通項の wiki 蓄積

このリポジトリの過去の merged PR / closed issue と `workspace/research/` の調査結果から、定型手順 / 規約や再発指摘 / 失敗パターンとして繰り返し現れる共通項を抽出し、最新コードと突き合わせて `docs/wiki/` に蓄積する。提案は必ず PR で行う。

## 不変条件

| 条件          | 内容                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| PR 経由       | デフォルトブランチへ直接コミット / プッシュしない                                                                  |
| 進捗の記録    | cursor は最後にマージされた scribe PR の mergedAt。research ファイルはその mergedAt と mtime を比べる              |
| 閾値 2 件     | 根拠が 2 件未満の共通項はページにせず `docs/wiki/_candidates.md` に置く。research ファイル 1 件を根拠 1 件と数える |
| 事実のみ      | PR / issue と research ファイルに書かれた事実、および現在のコードで確認できた事実のみ書く。推測で埋めない          |
| 参照の追跡性  | `workspace/research/` のファイルパスを `docs/wiki/` 配下に書かない                                                 |
| worktree 隔離 | 編集 / commit は隔離 worktree 内で行い、ユーザーの作業ツリーを動かさない                                           |

## Phase 1: 前提確認とオンボーディング

1. `gh pr list --label scribe --state open --limit 1` で未マージの scribe PR を確認する。あれば追い越さず、中断して報告する
2. `docs/wiki/README.md` が無ければ `${CLAUDE_SKILL_DIR}/templates/readme.md` のテンプレートで作成し、後続の PR に含める
3. scribe ラベルが無ければ `gh label create scribe --description "scribe による wiki 提案"` で作成する

## Phase 2: スコープ決定

1. 最後にマージされた scribe PR の mergedAt を `gh pr list --label scribe --state merged --limit 1 --json mergedAt -q '.[0].mergedAt'` で取得する
2. mergedAt が取れなければ初回。`gh pr list --state merged --search '-label:scribe'` と `gh issue list --state closed` の全件、および `find workspace/research -name '*.md'` の全件を対象にする
3. mergedAt が取れたら、`gh pr list --state merged --search "-label:scribe merged:><mergedAt>"` の PR と `gh issue list --state closed --search "closed:><mergedAt>"` の issue、および `find workspace/research -name '*.md' -newermt "<mergedAt>"` のファイルを対象にする
4. research の対象は `*.md` だけとし、他の形式は読まない。ファイル内の `Generated:` 行は cursor に使わない
5. PR / issue / research のいずれも 0 件なら「新規なし」と報告して終了する

## Phase 3: 抽出

1. `docs/wiki/*.md` と `docs/wiki/_candidates.md` を読み、既存ページ / 候補を把握する
2. スコープの各 PR / issue を `gh pr view <番号> --comments` / `gh issue view <番号> --comments` で本文 / コメントまで読む
3. スコープの各 research ファイルを Read で全文読む。セクション名で絞らない
4. 読んだ内容を次の表で振り分ける。設計判断とその経緯は `docs/decisions/` の領分なので対象外

根拠の書き方は、PR / issue 由来なら `#番号`、research 由来なら `(research)` とする。

| 該当先                     | 操作                                          |
| -------------------------- | --------------------------------------------- |
| 既存ページの共通項         | 根拠を追記し、内容に変化があれば更新          |
| 候補に 2 件目の根拠        | ページへ昇格し、候補の行を消す                |
| どこにも無い繰り返しの兆し | `_candidates.md` に「内容 1 行 + 根拠」で追記 |
| 1 度きりの個別事情         | 書かない                                      |

## Phase 4: 最新コードとの突き合わせ

ページ化 / 昇格 / 更新の前に、各共通項を現在のコードと突き合わせる。成立を確認した項目には現行コードの位置を参照コードとして `path` + シンボル名で付記し（行番号は書かない）、検証で落とした項目は `§ Phase 6: PR 作成` の PR 本文に列挙する。

| 確認                                                | 不成立時の扱い                                     |
| --------------------------------------------------- | -------------------------------------------------- |
| 規約 / 手順が現在の実装でも成立するか               | 書かない。既存ページの項目なら不成立として更新する |
| lint / hook / CI ですでに機械的に強制されていないか | 書かない                                           |
| 参照するパス / コマンドが現存するか                 | 現行のパス / コマンドに直して書く                  |

あわせて、今回のスコープに関係しない既存ページも含めた `docs/wiki/*.md` 全ページの参照コードを掃除する。ファイルの存在と、ファイル内でのシンボル名の grep 一致を機械的に確認し、壊れていた参照は現行コードを読み直して張り替える。参照先を失って共通項自体が成立しなくなっていた場合は不成立として更新する。

## Phase 5: 由来リンクの判定

ページ化 / 昇格 / 更新するページでは、共通項が `docs/decisions/` の特定 DR の決定から派生している場合に限り、「由来」節に DR のファイルパスを書く。判定は反事実テスト「その DR が supersede されたらこのページは書き換えが必要になるか」で、Yes のときだけ張る。1 ページに 3 本以上並んだら各リンクに反事実テストを再適用し、No になったものを外す。

あわせて、既存ページも含めた全ページの由来リンクを掃除する。DR ファイルの実在と status を確認し、superseded なら後継 DR を読んで、共通項が引き続き成立する場合は由来を後継へ張り替え、成立しない場合は不成立として更新する。

## Phase 6: PR 作成

上限は 1 回あたり最大 3 ページで、昇格 + 更新の合計として数え、`_candidates.md` の編集、`§ Phase 4: 最新コードとの突き合わせ` の参照修理、`§ Phase 5: 由来リンクの判定` の由来修理は数えない。超過分は根拠件数の多い順に優先し、残しを PR 本文に明記する。変更が何も無ければ PR を作らない。候補追記のみでも PR を作る。

1. `git fetch origin <デフォルトブランチ>` の後、`origin/<デフォルトブランチ>` から隔離 worktree とブランチ `scribe/<yyyymmdd-HHMMSS>` を作る
2. worktree 内で `${CLAUDE_SKILL_DIR}/templates/page.md` の骨格に従って `docs/wiki/` を編集し、メッセージ `docs(wiki): <共通項名, ...> を追加/更新` でコミットする
3. push して `gh pr create --base <デフォルトブランチ>` を実行する。タイトル `[scribe] <共通項名, ...> を追加/更新`、ラベル scribe
4. 本文には追加 / 昇格 / 更新したページ、候補への追記、参照修理 / 由来修理したページ、読んだ PR / issue の範囲と research の件数、検証で落とした項目、打ち切った残しを書く
5. worktree を削除する
