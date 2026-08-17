# レビューチェックリスト

## Plan 整合性

ファイルごとレビューの前に実行する。

### Step 1: plan の特定

plan は起点となる issue の `## Plan` 節にある。ブランチや commit messages の issue 参照から `gh issue view <N>` で取得する。issue が見つからない場合、`.claude/workspace/planning/` で、ブランチ名や PR タイトルに一致する `*.plan.md` を探す。

plan が見つからない場合、PR 説明 + commit messages を意図のソースとしてフォールバックし、U/T の行はスキップする。

### Step 2: チェック

各フラグの根拠となる意図の行を引用する。引用 U-NNN/T-NNN 行を欠く `wrong`/`missing` は印象判定なので落とす。このスクリーニングは reviewer-conformance と同じ 3 適合性カテゴリを覆う。任意のブランチで深い standalone パスが要るときはそのエージェントを起動する。

| チェック      | ソース                               | 条件      | フラグ       |
| ------------- | ------------------------------------ | --------- | ------------ |
| Unit coverage | Plan 節の U-NNN unit                 | plan あり | missing      |
| Test coverage | Plan 節の T-NNN 受け入れテスト       | plan あり | missing      |
| Scope creep   | diff vs 全意図ソース                 | 常時      | out-of-scope |
| Impl-wrong    | diff の振る舞い vs unit goal / T-NNN | 常時      | wrong        |

### 出力形式

```text
Plan Alignment: [CLEAN | MISSING <N> | OUT-OF-SCOPE <N> | WRONG <N> | MIXED]
Intent source: <issue #N Plan section | *.plan.md path | PR description | commit messages>
Missing (U): U-NNN - <description> (plan: "<quoted line>")
Missing (T): T-NNN - <description> (plan: "<quoted line>")
Out-of-scope: <file or area> - not traceable to stated intent
Wrong: <U-NNN/T-NNN> - implemented but <gap> (plan: "<quoted line>")
```

意図ソースが何もない場合は黙ってスキップする。

## ファイル別レビュー

| チェック     | 何を見るか                                       |
| ------------ | ------------------------------------------------ |
| PR alignment | 変更が記載目的に資するか                         |
| Code style   | 周囲のコードベースと一貫しているか               |
| Security     | injection, XSS, auth bypass, secret 漏洩         |
| Side effects | 既存機能への意図しない振る舞い変更               |
| Performance  | 不要な API/DB 呼び出し、メモリリーク、N+1 クエリ |
| Code smells  | 重複、深いネスト、god 関数                       |

## 依存影響

| チェック            | 方法                                        |
| ------------------- | ------------------------------------------- |
| Import dependents   | 変更ファイル/exports の import を ugrep     |
| Interface contracts | 関数シグネチャが不変か検証                  |
| Shared state        | グローバル/モジュール状態の mutation を確認 |
| Test coverage       | 既存テストが変更パスに対し有効か            |

## テスト評価

### "テスト追加" を提案する前に

1. プロジェクトにテストインフラがあるか確認
2. 類似コードにテストがあるか確認
3. プロジェクト規約がテストを期待する場合のみ提案する
