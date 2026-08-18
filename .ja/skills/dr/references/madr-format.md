# MADR: Markdown Architectural Decision Records

MADR は決定を記録する簡潔な markdown テンプレートで、決定 1 件につきファイルを 1 つ作る。このファイルは v4 を前提とする。A の展開は 2022 年に Any へ、2024 年に Architectural へ戻ったが、upstream はどちらの時期も any decision の記録を認めており、変わったのは focus の置き方だけ。このスキルは字面の揺れから降りて DR と呼び、アーキテクチャに限らない決定を対象とする。

## 必須セクション

Confirmation は upstream MADR v4 では任意だが、このスキルでは必須として扱う。

| セクション                    | 目的                             |
| ----------------------------- | -------------------------------- |
| Title                         | `# {title}` の短い宣言文         |
| Context and Problem Statement | 決定の理由                       |
| Considered Options            | 検討した代替案を箇条書きで挙げる |
| Decision Outcome              | 選択した選択肢と端的な根拠       |
| Confirmation (under Outcome)  | 実装が決定と一致するかの検証方法 |

## 推奨セクション

More Information 配下の h3 に置く。More Information を持たない DR では h2 の独立節でよく、validate-dr.py はどちらの階層も認める。欠けても error にせず warning を返す。

| セクション            | 目的                                                               |
| --------------------- | ------------------------------------------------------------------ |
| Reassessment Triggers | 決定を再評価する条件。既存構造の削除や統合を提案する側がここを読む |

## 任意セクション

| セクション                   | 含める基準                                     |
| ---------------------------- | ---------------------------------------------- |
| Decision Drivers             | 選択を導いた基準                               |
| Consequences (under Outcome) | `Good, because ...` / `Bad, because ...`       |
| Pros and Cons of the Options | 選択肢ごとの詳細を `### {option}` 見出しで示す |
| More Information             | 移行計画、関連リンク                           |

## Status ライフサイクル

| Status                | 意味                          |
| --------------------- | ----------------------------- |
| proposed              | レビュー待ち                  |
| accepted              | 承認済み、実装中または完了    |
| rejected              | 検討したが採用せず            |
| deprecated            | 後継 DR なしで廃止            |
| superseded by DR-NNNN | ID を記録して別 DR に置き換え |
