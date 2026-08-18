---
name: fix
description: 開発環境で 1〜3 ファイルに収まるバグ修正を実行する。起票済み issue の番号を渡せば、その修正はそのまま引き継ぐ。新機能実装や 4 ファイル以上の変更には使わない (/think と /issue で Plan 節を作り build workflow に渡す)。
when_to_use: バグ修正, 直して, 修正して, fix bug, 不具合
allowed-tools: Bash(git diff:*) Bash(git ls-files:*) Bash(gh issue view:*) Bash(npm test:*) Bash(npm run) Bash(npm run:*) Bash(yarn run:*) Bash(pnpm run:*) Bash(bun run:*) Edit Read LS Agent AskUserQuestion Skill Bash(ugrep:*) Bash(bfs:*)
model: opus
argument-hint: "[bug or issue description]"
---

# /fix - クイックバグ修正

## 入力

`$ARGUMENTS` の形が入り口を決める。対象は十分に理解できている 1〜3 ファイル規模の問題に限る。audit が返した finding をそのまま渡すときは、複数あれば severity の高い順に 1 件ずつ直す。影響が 4 ファイル以上に及ぶ場合は先に § エスカレーションの複数ファイル判定を確認する。

| パターン                               | 読み方                              | 開始点         |
| -------------------------------------- | ----------------------------------- | -------------- |
| `file:line` と severity を持つ finding | そのまま使う                        | トリアージ     |
| `/^#?[0-9]+$/`                         | `gh issue view <番号>` で本文を読む | ビルドチェック |
| 空                                     | AskUserQuestion でバグ説明を尋ねる  | アウトカム参照 |
| その他                                 | バグ説明とみなす                    | アウトカム参照 |

## アウトカム参照

ビルドチェックの前に `.claude/OUTCOME.md` を読む。不在なら `/outcome` で stub を生成。バグまたは修正が outcome 状態の中にあるか確認する。範囲外なら § エスカレーション。

## ビルドチェック

package.json やプロジェクト設定からビルドコマンドを検出して実行。

| 結果         | 動作                                             |
| ------------ | ------------------------------------------------ |
| ビルドエラー | `Agent(subagent_type: resolver-build)` 起動、END |
| エラーなし   | トリアージに進む                                 |

## トリアージ

Obvious は RCA と regression test 生成の双方を省くため、誤修正リスクの低い finding に限る。

| 入力     | 条件                                            | パス        |
| -------- | ----------------------------------------------- | ----------- |
| バグ説明 | 単一箇所が特定 + 1〜3 行修正 + 類似パターンなし | Obvious     |
| バグ説明 | 断続的、複数の再現条件、または根本原因が不明    | Non-obvious |
| finding  | severity low / medium かつ 1〜3 行修正          | Obvious     |
| finding  | severity critical / high、または修正が非自明    | Non-obvious |

## Obvious

1. 最小限の修正を適用する
2. テストを実行し、他のテストに regression がないことを確認する

## Non-obvious

根本原因分析の起点は経路で変わる。下表に無い経路はバグ説明から始める。

| 経路                                                      | 根本原因分析の扱い                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| finding をそのまま渡した                                  | その file:line と summary を起点として渡す                       |
| issue 番号を渡し、本文が原因を file:line まで特定している | 省く。その原因を Root cause として引き継ぎ、Pattern だけ判定する |

1. `Skill("use-context-root-cause-analysis")` を起動して根本原因分析を実行する
2. `Agent(subagent_type: generator-test)` で regression test を生成する。渡すのは symptom、再現手順、分析が出した root cause
3. 生成の完了を待ち、regression test が Red であることを確認する
4. 修正を適用する
5. regression test が Green で、他のテストに regression がないことを確認する
6. Pattern に応じて ${CLAUDE_SKILL_DIR}/references/defense-in-depth.md を適用する

## エスカレーション

客観的トリガーで分岐し、自己評価による信頼度判断はしない。issue 番号を渡した経路から委譲するときは、起票済みの issue に `## Plan` 節があることを確かめてから番号を build workflow に渡す。

| 行き先         | トリガー                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| `/research`    | RCA で根本原因が特定できない。Pattern = Systematic。修正後のテスト失敗が 3 回続く (2 回目までは根本原因を再分析する) |
| build workflow | 4 ファイル以上に影響する。新機能のスコープに入る。渡す前に `/think` と `/issue` で Plan 節まで作る                   |
| ユーザーへ確認 | Fix が OUTCOME.md のスコープ外。Non-goals を再定義するか、Plan 節まで作って build へ回すかを決める                   |

## エラー処理

| エラー                      | 動作                                     |
| --------------------------- | ---------------------------------------- |
| resolver-build 失敗         | エラーを提示しユーザーに指示を仰ぐ       |
| generator-test タイムアウト | regression test をスキップして修正を続行 |

## 完了条件

すべて満たすまで完了としない。括弧付きの項目は、該当する場合のみ必須。

- [ ] 根本原因を特定 (Non-obvious パス)
- [ ] 全テスト pass
- [ ] RCA から Pattern フィールドを記録 (Non-obvious パス)
- [ ] defense-in-depth を適用 (Recurring/Systematic のみ)
- [ ] 再 audit を提案 (finding を渡した経路)
