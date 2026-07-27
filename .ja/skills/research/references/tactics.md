# 条件付きの調査手段

/research の Phase 4 から参照する。適用条件が揃ったときだけ読む手段を置く。ソース記法とドメインスコープは毎回使うので SKILL.md 本文が持つ。

## 実行経路の把握 (Feature planning または Bug investigation)

explorer-feature の起動条件と返り値は SKILL.md Phase 4 が持つ。ここは追い方だけを決める。Feature planning は将来経路を、Bug investigation は該当バグの実行経路を追う。spawn prompt には調査対象のタイトルをそのまま含める。空が返ったらキーワードを広げて再実行する。

## codegraph の優先 (.codegraph/ index があるとき)

`.codegraph/` index を持つリポジトリでは `codegraph sync` で更新し、構造を問う質問は codegraph で先に解決する。呼び出し元は `codegraph callers <symbol>`、影響範囲と波及テストは `codegraph impact <symbol>` で読み、出力を finding のソースに引用する。同じ質問に ugrep や grep の symbol 名検索を使ってもソースには認めない。index が無いリポジトリでは無断で init せず Explore と ugrep にフォールバックし、ugrep と grep は自由記述の内容検索に限って使う。
