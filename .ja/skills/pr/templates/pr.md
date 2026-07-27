# PR テンプレート

/pr がリポジトリに PR テンプレートを見つけられないとき、この骨格で本文を生成する。

## テンプレート

`{...}` は生成時に内容へ置き換える。`(任意)` のセクションは、書くことがなければ見出しごと省略する。`Preview URL:` は UI 変更がある PR にのみ記載し、`use-workflow-pageshot` が読む。

```markdown
Preview URL: http://localhost:3000

## What & Why

{この PR が何をするか - 1-2 文}
{Why - どの問題を解決するか、何を可能にするか}

## Review focus

- {重点的に見てほしい箇所と、流し読みでよい箇所}
- {マイグレーション、ロールバック、パフォーマンスのリスク。無ければこの行を省略}

## Changes (任意)

- {変更 1。何を変えたかとその理由を 1 行で。ファイルや関数の目録は書かない}
- {変更 2。同上}

## Scope (任意)

- Not included: {この PR が意図的に行わないもの}

## Design Decisions (任意)

- {このアプローチを代替肢より選んだ理由}

## How to Test

1. {Step}
2. {Expected result}

## Related

- Closes #{issue}
```

## ガイドライン

| フィールド       | OK                                                    | NG                                       |
| ---------------- | ----------------------------------------------------- | ---------------------------------------- |
| What & Why       | オフライン分析を解除するため CSV エクスポートを追加   | CSV エクスポート機能を追加 (Why なし)    |
| Review focus     | 並列度の上限計算を重点的に。README の差分は流し読みで | 省略 (reviewer が全体を等しく読む)       |
| Changes          | ExportButton を追加。1-click のためメニューより選択   | 触ったファイルの列挙 (diff が運ぶ)       |
| Scope            | 認証トークンのリフレッシュは含めない (別 PR)          | 大きな PR で省略 (reviewer が境界を推測) |
| Design Decisions | 大規模データセットの OOM 回避にストリーミングを採用   | 省略 (reviewer が理由推測を強いられる)   |
| How to Test      | Export をクリック → .csv が 3 行でダウンロードを確認  | 機能をテスト (曖昧)                      |
| Preview URL      | Preview URL: http://localhost:3000/dashboard          | UI 変更があるのに欠落                    |
