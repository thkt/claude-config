# Canonical Finding Schema

audit sub-reviewer 全員に必要な base field。Leader (Medium tier) または Integrator (Large tier) が統合時にドメイン特化拡張を正規化する。

## Base Fields (必須)

finding ごとに、Markdown 見出しに続いて 1 つの表を出力する。

### {PREFIX}-{seq}

| Field        | Value                          | Source      |
| ------------ | ------------------------------ | ----------- |
| Agent        | reviewer-name                  | auto-filled |
| Severity     | critical / high / medium / low | reviewer    |
| Category     | ドメイン特化カテゴリ           | reviewer    |
| Location     | `file:line`                    | reviewer    |
| Evidence     | コードスニペットまたは観測     | reviewer    |
| Trigger      | issue が顕在化する具体的条件   | reviewer    |
| Reasoning    | なぜこれが問題なのか           | reviewer    |
| Fix          | 推奨修正                       | reviewer    |
| Verification | check タイプ。質問             | reviewer    |

### Agent (auto-fill)

integrator/leader が spawn した reviewer の `name:` frontmatter から `Agent` を埋める。reviewer は出力に自分の名前を繰り返してはならず、Agent 行は完全に省く。

### Trigger と Reasoning の区別

これらは別フィールド。混ぜてはいけない。

| Field     | 質問           | 例                                                                               |
| --------- | -------------- | -------------------------------------------------------------------------------- |
| Trigger   | いつ発火するか | "Bash tool 呼び出しのたび (PreToolUse hook が毎回走る)"                          |
| Reasoning | なぜ悪いか     | "awk fork+exec がホットパスで 2-5ms かかり、case フィルタの短絡前にコストが入る" |

Trigger が Reasoning の冒頭句と同一なら、その finding は抽象すぎる。verifier が再現可能な観測条件として Trigger を書き直す。

### 報告基準

以下すべてが満たされるときのみ finding を報告する。それ以外は報告しない。

- reviewer が hedging language なしで issue を述べられる ("might", "could", "possibly" は不可)
- 具体 trigger と reasoning の両方が書ける (言語制約を参照)
- reviewer が対象ファイルを読み、現在のコードでその条件を確認した

reviewer-security は基準が低い。悪用可能性が不確実でも、具体修正案が伴うなら finding を含める。

### 報告前検証

finding を報告する前に、reviewer は以下を必ず行う。

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

## キャリブレーションフィルタ

順に適用する。いずれかが除外したら報告しない。

| Filter              | 質問                                                             | 除外条件                                   |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| Senior Engineer     | senior engineer なら変更を要請するか                             | "好み次第" または "PR をブロックしない"    |
| Harm                | bug/data loss/security/maintenance burden の具体トリガーがあるか | 挙げられない                               |
| Fix Proportionality | 修正がリスクに見合うか                                           | 低 severity issue に対する大規模リファクタ |

### Context Test

| コンテキスト    | アクション                                                  |
| --------------- | ----------------------------------------------------------- |
| Cold path       | severity >= high でない限り除外                             |
| Intentional     | code comments、エラーメッセージ、命名が意図を示唆 → 除外    |
| Framework idiom | framework/library の慣用に従う → 除外                       |
| Indirect cover  | caller または integration test 経由でテスト済み → 除外 (TC) |
| Semantic differ | 構造は似ているが business logic が異なる → 除外 (DRY)       |

各 reviewer の Calibration セクションにドメイン別 REPORT/SKIP 例がある。迷ったら SKIP を優先。challenger は false negative を捕まえる存在だが、false positive は pipeline capacity を浪費する。

## 概要表

複数 finding がある場合、この summary 表を先頭に置く。

| ID  | Severity | Category | Location |
| --- | -------- | -------- | -------- |

## ドメイン特化拡張 (統合時に正規化)

ここに載っていない reviewer は base field のみ使う。

| Reviewer               | 追加フィールド                                    | Req/Opt | 正規化                                                          |
| ---------------------- | ------------------------------------------------- | ------- | --------------------------------------------------------------- |
| reviewer-causation     | five_whys, root_cause                             | req     | root_cause → reasoning; five_whys → evidence に追記             |
| reviewer-progressive   | recommendations                                   | req     | 別アイテムとして追記                                            |
| reviewer-readability   | subcategory                                       | opt     | category に category/subcategory 形式で追記                     |
| reviewer-performance   | impact                                            | opt     | evidence に追記; impact → reasoning note                        |
| reviewer-accessibility | wcag (req), apg_pattern (req), code_example (opt) | req/opt | wcag → evidence; apg_pattern, code_example → fix のコンテキスト |
| reviewer-coverage      | related_code, criticality                         | opt     | related_code → evidence; criticality → reasoning note           |
| reviewer-encapsulation | type_name, scores                                 | opt     | evidence に追記; scores → reasoning note                        |
| reviewer-security      | entry_points (in hint)                            | opt     | 既に verification_hint                                          |
| reviewer-resilience    | blast_radius, failure, hypothesis                 | req     | blast_radius が severity を置換; failure+hypothesis → reasoning |
| reviewer-duplication   | multi_location_evidence                           | req     | Evidence に全 source location をリスト                          |
| reviewer-reuse         | existing_code                                     | req     | Evidence で新規コードと既存代替をペアにする                     |
| reviewer-efficiency    | path_frequency                                    | opt     | hot/warm/cold → reasoning note                                  |
| reviewer-strictness    | type_coverage, strict_flags                       | opt     | summary レベル metric のみ                                      |

## ID Prefix レジストリ

| Prefix | Reviewer                                  |
| ------ | ----------------------------------------- |
| SEC    | reviewer-security                         |
| SF     | reviewer-silence                          |
| TS     | reviewer-strictness                       |
| TD     | reviewer-encapsulation                    |
| CQ     | reviewer-readability                      |
| PE     | reviewer-progressive                      |
| RC     | reviewer-causation / integrator synthesis |
| DP     | reviewer-design (module depth)            |
| RP     | reviewer-react-pattern                    |
| TEST   | reviewer-testability                      |
| TC     | reviewer-coverage                         |
| PERF   | reviewer-performance                      |
| A11Y   | reviewer-accessibility                    |
| DRY    | reviewer-duplication                      |
| REUSE  | reviewer-reuse                            |
| EFF    | reviewer-efficiency                       |
| DOC    | reviewer-document                         |
| OPS    | reviewer-operations                       |
| PQ     | reviewer-prompt                           |
| CHX    | reviewer-resilience                       |
| PF     | pre-flight (エージェントファイルではない) |

## Consolidation ルール

同じパターンが複数箇所に現れた場合、以下を適用する。

- 単一 finding として報告する
- evidence にすべての location をリスト (max 5、超えたら "and N more")
- severity は出現箇所の中で最高に設定

例えば "Unused import in 7 files" は 1 finding で、severity は最悪ケースから取る。

## デフォルトのエラー処理

reviewer 個別定義で上書きされない限り、すべての reviewer が以下を適用する。

| Error        | アクション                                       |
| ------------ | ------------------------------------------------ |
| bfs 空       | 0 ファイル発見と報告; clean と推論しない         |
| ツールエラー | エラーをログ、ファイルをスキップ、summary に記録 |

ドメイン特化のガード (入力欠如、依存利用不可) は各 reviewer 自身の `## Error Handling` セクションに残す。
