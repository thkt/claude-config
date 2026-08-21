# 書き出し前検証

/think の Phase 3 手順 6 から参照する。plan を書き出す前に 1 回だけ通す。

build workflow の Revalidate と同じリポジトリルートで検証し、失敗した行は修正するか落とす。`base:` が現在の checkout と異なるブランチを指すときは、base ブランチ側の内容で検証する。ファイルの実在は `test -f <path>` の代わりに `git cat-file -e <base>:<path>` を使い、anchor は `git show <base>:<path> | ugrep -F '<pattern>'` を使う。

1. `### 前提` の各行。path は `test -f <path>`、anchor は `ugrep -F '<pattern>' <path>` (base が異なるときは上記の base ブランチ形式)
2. `units[].files` と `reference_module.files` のうち既存ファイルを指す行を `test -f <path>` で確認 (同じく base ブランチ形式に置き換え)
3. 既存ファイルを触る unit があるのに `### 前提` が空か不在なら失敗。要となる依存を anchor する行を足す
4. `reference_module: null` は理由の明記が散文に無ければ失敗
5. templates/plan.md が定める行数規則を超えていないこと
6. 各 non-seam unit の `files` と T-NNN の個数を数え、unit 上限に収まっていること。超えていれば分割してから再検証する
7. test_command をリポジトリルートで 1 回実行する。plan より前から在る原因で失敗したら、`### test_command` に従ってコマンドを絞り直す。絞った理由は plan の散文に書く。前からある原因とは script 不在やリポジトリ全体の負債
8. T-NNN のうち test_command で実行できない基準が紛れていないこと。紛れていれば `### 実機確認` へ移す
