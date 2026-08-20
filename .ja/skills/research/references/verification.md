# 検証手順

/research の Phase 4 と Phase 5 の sweep から参照する手順を定義する。

どれを使うかは finding の種類で決まる。網羅性 finding には Cross-method 検証、外部システムの挙動に関する主張には一次ソース検証を構造的に適用し、自己判断による finding 除外は認めない。ライブラリ API 挙動の検証は ${CLAUDE_SKILL_DIR}/../../rules/development/SOURCING.md を適用する。

## Cross-method 検証

各トリガーは構造的に適用し、自己判断による finding 除外は認めない。網羅性を主張する finding が後段の PR スコープを駆動する、またはリポジトリを跨ぐときに、この検証を掛ける。対象は「該当の caller が無い」「X が唯一の Y」「X が Y の網羅的な一覧」「[リポジトリ集合]で未使用」のような主張。ugrep、bfs、Agent(Explore)、対象を絞った Read のうち少なくとも 2 つで検証する。結果が食い違うときは差異をフラグし、ツールエラーを特定してから記録する。単一ツールでの 0 件結果は疑わしい状態であって、決定的ではない。

## 一次ソース検証

外部挙動の claim を一次ソースで検証する。

1. Source が、このセッションで実行していない外部システムの振る舞いを参照する finding を抽出する。hook 発火タイミング、action や parser の要求 schema、ライブラリ API 挙動、引用文献の主張が典型。結論、Next Action、Disconfirmation のいずれかがその claim の正しさへ依存するものに限る
2. 抽出した claim を一括で一次ソースと突合する。web docs は `scout fetch <公式 docs URL>`、GitHub 上のソースは `scout repo-read` か `scout repo-overview` を使う。コマンドの正典は use-cli-scout
3. paywall、docs 不在、fetch 失敗、scout 未導入などで一次ソースが辿れない場合は finding を残して `unverified external claim` とマークし、Disconfirmation の根拠や Next Action の前提には使わない

リポジトリの README は未リリースの main を反映するので、公開版の機能の一次ソースにはならない。公開版が何を受けるかは `npx <pkg>@latest <cmd> --help` と実行で確かめる。

## 0 件の解釈

0 件は「存在しない」と「引き方が違う」を区別しない。不在と結論づける前に、同じ引き方が非 0 を返す例で往復させる。絞り込みが機能すると言うには、実際に該当がある値で測る。未使用の値で測ると 0 件が返り、絞り込みの成否と区別が付かない。

| 引き方                            | 0 件になる別の理由                                                           |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `gh issue list --search` の複数語 | 語を AND で結ぶので、1 語でも外れると 0 件になる                             |
| ラベルやフィールドでの絞り込み    | その値が 1 件も付いていない。存在しない値と同じ 0 件を返す                   |
| repo を指定した issue 検索        | 探している issue が上流でなく自分の repo にある。`--owner <自分>` で引き直す |

## Same-origin sweep

Bug investigation で root cause を確定した後、同じ origin を共有する artifact 群を sweep して兄弟欠陥を探す。

1. root cause ファイルの導入コミットを `git log --follow --diff-filter=A` で特定し、そのコミットの全ファイルを `git show --stat` で列挙する
2. コミットメッセージやファイルヘッダに `auto-generated from X` や template・deploy 注記のような生成元表記があれば、X 由来の全ファイルも sweep 対象に加える
3. 各兄弟について、それを読む action や parser や loader を consumer として特定し、consumer の要求仕様をその場で fetch して兄弟を突合する。scout 手順は上記の一次ソース検証と同じ
4. config の keys や block-list とフォームの options のように兄弟同士が値を参照し合う場合、値集合同士を diff し、自滅的な整合をフラグする。block-list が選択可能な全値を含む、どの兄弟も定義しない値を参照する、が典型
5. 兄弟ごとに pass・同種欠陥・別種欠陥を根拠付きで記録する
