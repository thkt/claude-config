---
name: stock
description: docs/REFERENCE_INDEX.md の各行を dangling-path/no-match/unsupported/unreferenced に区分した型付きレポートを決定論スクリプトで生成し、提示する。unreferenced な docs からランク付け + 上限付きの索引化候補を提案し、行単位の採否は人間に委ねる。
when_to_use: REFERENCE_INDEX drift 確認, 索引ずれ検出, 未索引 docs 発掘, reference index check, index candidate proposal, dangling reference 検出
allowed-tools: Read Bash(node:*) Bash(git:*) AskUserQuestion
argument-hint: "[index path]"
---

# /stock - REFERENCE_INDEX drift 検出と索引化候補提案

## 入力

`$ARGUMENTS` は監査対象の index ファイルのリポジトリ相対パス。省略時は `docs/REFERENCE_INDEX.md` とする。行フォーマット (glob/description/path の 3 列、`-` 行の意味、対応 glob サブセット) の正は ${CLAUDE_SKILL_DIR}/references/reference-index-format.md。Phase 2 以降を適用する前に一読する。

## Phase 1: script 実行

`node ${CLAUDE_SKILL_DIR}/scripts/check-index.js <repo root> <index path>` を実行する。`<repo root>` にはリポジトリ内の任意のパス (通常は `.`) を、`<index path>` には入力節で確定した index ファイルの絶対または相対パスを渡す。script は `git ls-files` 由来の tracked file 一覧と index の各行を照合し、`dangling`/`noMatch`/`unsupported`/`unreferenced`/`size`/`exitCode` を持つ JSON を標準出力に返す。

## Phase 2: レポート提示

Phase 1 の JSON を区分ごとの表として提示する。dangling があるときは、index 側の修正 (path 訂正または行削除) を優先課題として明記する。

| 区分         | 意味                                                                                                                                 | 深刻度                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| dangling     | path 列の参照先が存在しない                                                                                                          | エラー (exitCode 非ゼロの直接要因) |
| noMatch      | glob 列がどの tracked file にも一致しない                                                                                            | 警告                               |
| unsupported  | glob 列が対応文字集合 (${CLAUDE_SKILL_DIR}/references/reference-index-format.md の Supported glob subset) 外、または裸の `**` を含む | 警告                               |
| unreferenced | `docs/` 配下の md で、index のどの行の path 列からも参照されていない                                                                 | Phase 3 の入力                     |
| size         | index 表の行数 (前後の散文は数えない) と 1 画面閾値 (30 行、ADR-0091) 超過の有無                                                     | 閾値超過時のみ警告                 |

## Phase 3: 候補提案

unreferenced の各 docs パスについて、索引化候補を以下の手順で作る。

### 3a 候補 glob の推測

unreferenced の doc が置かれたディレクトリ名から、対応しそうなソース側ディレクトリ (例 `docs/conventions/component-tsx.md` なら `src/**/*.tsx` のような同名接頭辞) を推測する。対応するソース側ディレクトリが見つからない doc (どのソースディレクトリ名とも対応しない、複数ドメインを横断する等) は 3c へ回す。

### 3b ランク付けと上限

3a で候補 glob を得られた doc について、その glob が一致する tracked file 数を rank スコアとする (一致数が多いほど、その doc とソースコードの対応が具体的で上位)。rank 降順で並べ、上位 10 件までを候補表 (glob/description/path の 3 列、${CLAUDE_SKILL_DIR}/references/reference-index-format.md の行形式に合わせる) として提示する。10 件を超えた分は超過件数のみを 1 行で示す。対象 doc 数が 20 件を超える場合は、候補表を出す前に AskUserQuestion で絞り込み対象 (ディレクトリ単位、上位 N 件など) を確認する。

### 3c `-` 行は提案しない

3a でソース側ディレクトリ対応が見つからなかった doc は、候補表に含めない。「手動追記推奨」として path と対応が見つからなかった理由だけを別リストに列挙し、glob 列に `-` を書いた行は提案しない。`-` 行は ${CLAUDE_SKILL_DIR}/references/reference-index-format.md が定めるとおり glob 照合を離れた人間の判断を必要とするため、追記そのものを人間の手作業に残す。

## 引き継ぎ

- 候補表 (3b) と手動追記推奨リスト (3c) を提示し、採否は行単位で人間が決める
- 本 skill は index を書き換えない。採用行の追記と dangling/noMatch/unsupported の修正は人間の作業に残し、個々の候補の妥当性検証は範囲外として `/fix` や直接編集に委ねる

## 完了条件

以下をすべて満たしたときのみ終了する。満たせない項目は理由を提示する。

| 項目         | 条件                                                                         |
| ------------ | ---------------------------------------------------------------------------- |
| レポート     | dangling/noMatch/unsupported/unreferenced/size の全区分を提示                |
| 候補表       | unreferenced のうち候補 glob を推測できた doc をランク降順、上限 10 件で提示 |
| 手動追記推奨 | 候補 glob を推測できなかった doc を `-` 行を書かずに理由付きで列挙           |
| 引き継ぎ     | 採否が人間の行単位の判断に委ねられている旨を明記                             |
