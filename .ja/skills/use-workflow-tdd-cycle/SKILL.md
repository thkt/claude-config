---
name: use-workflow-tdd-cycle
description: RGRC サイクルと Baby Steps による TDD。
when_to_use: TDD, テスト駆動, Red-Green-Refactor, Baby Steps
allowed-tools: Read Write Edit Bash(ugrep:*) Bash(bfs:*)
context: fork
user-invocable: false
---

# TDD サイクル

公開 API を通して振る舞いをテストする。Mock はシステム境界でのみ。

## バリアント選択

下表でバリアントが決まらないとき、およびテストが実装を検証していないか確かめるときは ${CLAUDE_SKILL_DIR}/references/test-philosophy.md を読む。

| トリガー                             | バリアント      | 参照                                                 |
| ------------------------------------ | --------------- | ---------------------------------------------------- |
| spec.md / 新機能 (`/code`)           | Feature-driven  | ${CLAUDE_SKILL_DIR}/references/feature-driven.md     |
| バグ報告 / リグレッション (`/fix`)   | Bug-driven      | ${CLAUDE_SKILL_DIR}/references/bug-driven.md         |
| 既存コードベースのカバレッジギャップ | Coverage-driven | テストを active にし skip しない。下記 RGRC を再利用 |

## 何をテストするか

| 優先度   | 内容                                                       |
| -------- | ---------------------------------------------------------- |
| 必須     | ビジネスロジック、サービス、クリティカルパス、エッジケース |
| 文脈依存 | 複雑な util、custom hook、変換                             |
| スキップ | 単純な accessor、UI レイアウト、外部ライブラリの挙動       |

### TDD を使わない場面

| 文脈                      | 理由                                  |
| ------------------------- | ------------------------------------- |
| 使い捨てのプロトタイプ    | 廃棄される可能性が高い、コスト > 効果 |
| 外部 API 連携             | API を mock する。連携は mock しない  |
| 単純な one-off スクリプト | テストの方が長くなる                  |
| UI 実験                   | まずビジュアル、後でロジックを抽出    |

## RGRC サイクル

Red でテストを書く前に ${CLAUDE_SKILL_DIR}/references/writing-tests.md を読み、テスト設計技法、アサーション品質、mock の境界を適用する。

| フェーズ | 目標           | ルール                                                                                      | よくある間違い                           |
| -------- | -------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Red      | 失敗するテスト | 失敗が意図する挙動の差分と一致することを確認。syntax/import エラー不可                      | テストが即座にパスする                   |
| Green    | テストをパス   | "罪を犯してよい" - 汚いコードでも OK                                                        | 実装しすぎ                               |
| Refactor | 綺麗なコード   | テストを green に保つ。読みやすくなる場合に限り縮める。基準は ${CLAUDE_SKILL_DIR}/../../rules/PRINCIPLES.md | 振る舞いを変更してしまう。難読化する圧縮 |
| Commit   | 状態を保存     | 全チェックがパス                                                                            | チェックを飛ばす                         |

## Baby Steps (1 サイクル 2 分半)

30s. 失敗するテストを書く → 1min. パスさせる → 10s. テストを実行 → 30s. 小さくリファクタ → 20s. green ならコミット。バグは常に直近の 1 サイクル分の変更に潜む。

## Vertical Slices のみ

RGRC サイクルは振る舞いごとに縦へ積む。全テストを先に書き、全実装を後でまとめる横方向の展開は決してしない。

```text
Wrong (horizontal):
  Red:   test1, test2, test3, test4, test5
  Green: impl1, impl2, impl3, impl4, impl5

Right (vertical):
  Red → Green: test1 → impl1
  Red → Green: test2 → impl2
  ...
```

| #   | 横方向スライスの危険                                                     |
| --- | ------------------------------------------------------------------------ |
| 1   | 一括で書いたテストは実際の挙動ではなく想像した挙動を検証する             |
| 2   | テストがデータ形状やシグネチャといった構造的なアサーションだけに退化する |
| 3   | 挙動変化への感度が落ち、壊れていてもテストがパスする                     |
| 4   | 実装の知見がテスト構造を導くのではなく、テスト構造に追従する             |

## テスト失敗の判断

テストが失敗したら、テストを直すか実装を直すかを判断する。`/fix` の bug-driven フローでは、再現手順が spec の役割を果たす。

| 判断       | 条件                        | アクション                     |
| ---------- | --------------------------- | ------------------------------ |
| 実装バグ   | テストが spec/FR-xxx と一致 | 実装を修正。テストには触らない |
| テストバグ | テストが spec から逸脱      | テストを修正                   |
| 不明確     | spec が曖昧または欠落       | ユーザーにエスカレーション     |

## 参照ファイル

| 読むとき                                   | ファイル                                                |
| ------------------------------------------ | ------------------------------------------------------- |
| Red でテストを書く前                       | ${CLAUDE_SKILL_DIR}/references/writing-tests.md         |
| バリアントが決まらない / テストを疑うとき  | ${CLAUDE_SKILL_DIR}/references/test-philosophy.md       |
| Feature-driven を選んだとき                | ${CLAUDE_SKILL_DIR}/references/feature-driven.md        |
| Bug-driven を選んだとき                    | ${CLAUDE_SKILL_DIR}/references/bug-driven.md            |
| テストが実行ごとに結果を変えるとき         | ${CLAUDE_SKILL_DIR}/references/flaky-test-management.md |
| どの範囲までテストするかを決めるとき       | ${CLAUDE_SKILL_DIR}/../../rules/development/TESTING.md  |
