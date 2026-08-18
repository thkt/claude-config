# Feature テンプレート

`/issue` が feature 種別と判定したとき、この骨格でタイトルと本文を生成する。

## Template

`{...}` は生成時に内容へ置き換える。`(任意)` のセクションは書くことがなければ見出しごと省略する。

```markdown
## What & Why

{作るもの - 1〜2 文}
{なぜ必要か - ユーザー問題やビジネス理由}

## Acceptance Criteria

- [ ] {When X, then Y happens}
- [ ] {When X, then Y happens}

## Scope

- In scope: {この issue がカバーするもの}
- Out of scope: {この issue で明示的に除外するもの}

## Accessibility (任意)

- {UI に触れる issue のみ。想定する操作系と満たす基準: `キーボードのみで全操作が完結する` / `エラーは aria-live でスクリーンリーダーに通知される`}
- {方針を選んだ理由 (任意): `ネイティブ <dialog> を採用。フォーカス管理が標準で付くため`}

## Approach (任意)

- {決めた実装方針: `既存構成に合わせて OrderService 配下に配置する`}

## Constraints (任意)

- {技術的制約、禁止アプローチ、依存関係}

## Testing Decisions

- {この issue における「良い」の定義: 実装詳細でなく外部振る舞いのみ}
- {テスト対象モジュール: どのモジュール/コンポーネント/関数をテストするか}
- {先行事例: 最も似ている既存テストへのリンクかファイル名}
- {スキップ理由 (任意): テストを追加しない場合、なぜかを明示する}
```

## ガイドライン

| フィールド          | OK                                                    | NG                                         |
| ------------------- | ----------------------------------------------------- | ------------------------------------------ |
| What & Why          | オフライン分析のため CSV エクスポートを追加           | CSV エクスポートを追加 (Why なし)          |
| Acceptance Criteria | Export クリックで .csv がダウンロードされる           | CSV エクスポートが正しく動く               |
| Scope - Out of      | Excel 形式は対象外                                    | (省略)                                     |
| Accessibility       | キーボードのみで全操作が完結する                      | UI 変更なのに省略、「a11y に配慮する」だけ |
| Approach            | OrderService の構成に合わせる                         | 決まっていない HOW を書く                  |
| Constraints         | 新規依存を追加しない                                  | (既知の制約があるのに省略)                 |
| Testing Decisions   | CSV シリアライザをテスト。tests/orders.test.ts を踏襲 | TBD または理由なしのスキップ               |
