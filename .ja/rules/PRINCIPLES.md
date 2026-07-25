# Principles

## 優先度マトリクス

| 優先度     | 原則                                    |
| ---------- | --------------------------------------- |
| Foundation | Outcome-driven                          |
| Foundation | Backcasting                             |
| Critical   | Occam's Razor                           |
| Critical   | Progressive Enhancement                 |
| Critical   | Systems Thinking                        |
| Default    | Readable Code                           |
| Default    | Miller's Law                            |
| Default    | TDD / Baby Steps                        |
| Default    | DRY                                     |
| Default    | Single Source of Truth                  |
| Default    | YAGNI Boundary                          |
| Default    | Reuse Ordering                          |
| Default    | Strong Inference                        |
| Default    | Measurement                             |
| Contextual | SOLID                                   |
| Contextual | Container / Presentational              |
| Contextual | Law of Demeter                          |
| Contextual | AI-Assisted Development (Overeagerness) |
| Contextual | TIDYINGS                                |

## トリガー

| トリガー                                       | 原則                    |
| ---------------------------------------------- | ----------------------- |
| 新規タスク or ゴール不明                       | Backcasting             |
| メソッドチェーン 2 超                          | Law of Demeter          |
| コードを縮めて難読化した                       | Readable Code           |
| 複雑優先                                       | Occam's Razor           |
| Work の前に Resilient / Fast / Flexible に着手 | Progressive Enhancement |
| 仮説が単一                                     | Strong Inference        |
| 同一前提の修正が 2 連敗                        | Strong Inference        |
| 局所の改善が全体を不変 or 悪化                 | Systems Thinking        |
| 同じ症状への修正が再発                         | Systems Thinking        |
| 連動する呼び出し箇所 2 以上                    | YAGNI Boundary          |
| 同じ知識の複製を作る直前 or 見つけた           | Single Source of Truth  |
| 新規コード or 依存追加の直前                   | Reuse Ordering          |
| 書いた後に冗長                                 | Occam's Razor           |
| 余分なファイル or 未要求スコープ               | Overeagerness           |

## 衝突解決

- Outcome-driven が why を、Backcasting がゴールを、他の原則が到達手段を定める
- Systems Thinking が最適化する範囲 (outcome を担うシステム全体) を定め、Occam's Razor がその範囲内の最簡を選ぶ
- 迷ったら simple > clever, concrete > abstract, working > perfect, readable > DRY
- Occam's Razor は、症状の一時的な軽減を成果と見なさない。アウトカム達成に直結し、かつ出力品質を損なわない最簡アプローチだけを選ぶ
