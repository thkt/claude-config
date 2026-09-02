# Canonical Finding Schema

audit の reviewer 全員が finding ごとに返すフィールド。schema を渡す呼び出し元 (workflows/audit.js の `findingsSchema()`) の下では、出力は下のフィールドだけを持つ JSON の `findings` 配列になる。schema の無い skill 経由では、各 finding は見出し `### {PREFIX}-{seq}` に続く 1 つの表で、同じフィールドを持つ。読んだ人間が次に何をするかは `finding-disposition.md` に、reviewer ごとの prefix と追加材料は `finding-registry.md` にある。

## Base Fields

reviewer の名前は integrator が spawn した agent の `name:` frontmatter から埋める。reviewer は出力に自分の名前を繰り返さない。

| Field              | 必須 | 値                                                                                    |
| ------------------ | ---- | ------------------------------------------------------------------------------------- |
| file               | yes  | location の file 部分                                                                 |
| line               | yes  | location の line 部分。文字列                                                         |
| severity           | yes  | critical / high / medium / low                                                        |
| summary            | yes  | issue とその根拠を述べる 1 文                                                         |
| category           | no   | reviewer 自身の finding カテゴリ                                                      |
| trigger            | no   | issue が顕在化する具体的条件                                                          |
| evidence           | no   | finding の根拠となるコードスニペットまたは観測                                        |
| reasoning          | no   | その条件がなぜ問題なのか                                                              |
| fix                | no   | reviewer が提案する変更                                                               |
| verification       | no   | check タイプと、それが答える質問                                                      |
| disposition        | no   | must / want / imo / nits。`finding-disposition.md` § Disposition に従う。省略で既定値 |
| disposition_reason | no   | finding が既定値から外れる理由。上書きには必須                                        |

### Trigger と Reasoning の区別

これらは別フィールド。混ぜてはいけない。Trigger が Reasoning の冒頭句と同一なら、その finding は抽象すぎる。verifier が再現可能な観測条件として Trigger を書き直す。

| Field     | 質問           | 例                                                                               |
| --------- | -------------- | -------------------------------------------------------------------------------- |
| Trigger   | いつ発火するか | "Bash tool 呼び出しのたび (PreToolUse hook が毎回走る)"                          |
| Reasoning | なぜ悪いか     | "awk fork+exec がホットパスで 2-5ms かかり、case フィルタの短絡前にコストが入る" |

### 報告基準

以下すべてが満たされるときのみ finding を報告する。それ以外は報告しない。

- reviewer が hedging language なしで issue を述べられる ("might", "could", "possibly" は不可)
- 具体 trigger と reasoning の両方が書ける (言語制約を参照)
- reviewer が対象ファイルを読み、現在のコードでその条件を確認した

reviewer-security は基準が低い。悪用可能性が不確実でも、具体修正案が伴うなら finding を含める。

### 報告前検証

finding を報告する前に、reviewer は以下を行う。

1. 報告 location の対象ファイルを読む (± 20 行のコンテキスト)
2. 記憶や推測ではなく、実際のコードに issue が存在することを確認する
3. ファイル読み込みなしの finding は無効。leader が破棄する

### 言語制約

Evidence, Trigger, Reasoning は具体的な言語を使う。

| 禁止                   | 置き換え                        |
| ---------------------- | ------------------------------- |
| might, could, possibly | does, causes, results in        |
| potentially            | when [condition], [consequence] |
| may cause              | causes [X] when [Y]             |
| theoretically          | (削除する。実際のパスを記述)    |
| in some cases          | when [specific condition]       |

## 概要表

skill 経由で複数 finding がある場合、この summary 表を先頭に置く。

| ID  | Severity | Category | Location |
| --- | -------- | -------- | -------- |

## 重複箇所ルール

同じパターンが複数箇所に現れた場合、以下を適用する。

- 単一 finding として報告する
- evidence にすべての location をリスト (max 5、超えたら "and N more")
- severity は出現箇所の中で最高に設定

例えば "Unused import in 7 files" は 1 finding で、severity は最悪ケースから取る。

## デフォルトのエラー処理

reviewer 個別定義で上書きされない限り、すべての reviewer が以下を適用する。ドメイン特化のガード (入力欠如、依存利用不可) は各 reviewer 自身のアウトプット節にある。

| Error        | アクション                                       |
| ------------ | ------------------------------------------------ |
| bfs 空       | 0 ファイル発見と報告; clean と推論しない         |
| ツールエラー | エラーをログ、ファイルをスキップ、summary に記録 |
