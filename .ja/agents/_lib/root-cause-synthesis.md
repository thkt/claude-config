# Root Cause Synthesis

enhancer-integration と enhancer-evidence が共有する、finding の集合を根本原因へ変える手順。何をクラスタとみなすか (ドメイン、根拠の種類) と、その後にスコア化や優先順位付けをするかは呼び出し側が決める。

## 手順

1. `file:line:category` で重複排除し最高 severity を保持する。寄稿者が severity で食い違ったら `severity_upgraded: true` とし `original_severities: [{reviewer, severity}]` を記録する
2. 具体的なトリガーまたはファイル読み取りによる検証を欠く finding を削除し、残りを保持する
3. finding を場所 (ファイル、モジュール、境界) でグループ化し、2 つ以上の寄稿者が同じ領域をフラグする収束シグナルを特定する
4. 収束クラスタごとに severity を下記ルールで再評価する
5. 相関のない finding はスタンドアロン項目として残す
6. 各収束クラスタについて、すべての finding を説明する根本原因を 1 つ合成し、個別 finding ではなく根本原因に根本原因分析を適用する
7. スタンドアロン finding は個別に根本原因分析を適用する
8. 根本原因を下記カテゴリで分類する

## severity 再評価ルール

- 影響評価を変える具体的な寄与 finding を引用する
- ドメイン横断のコンテキストが影響を変えない場合、`Independent findings. No upgrade.` と記録する
- 数だけでは引き上げを正当化できない。medium が 2 件でも high にはならない

## Root Cause Categories

| カテゴリ         | 指標                           | 解決           |
| ---------------- | ------------------------------ | -------------- |
| Architecture Gap | パターンがモジュールにまたがる | 設計変更       |
| Knowledge Gap    | 一貫性のないパターン           | ドキュメント化 |
| Tooling Gap      | linter で捕捉可能              | config 更新    |
| Process Gap      | レビューをすり抜ける           | プロセス変更   |
