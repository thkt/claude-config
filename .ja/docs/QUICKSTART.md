# Quick Start (5 分)

## 1. 基本コマンド

| コマンド    | 利用シーン                      |
| ----------- | ------------------------------- |
| `/fix`      | 小さなバグ、1〜3 ファイルの修正 |
| `/research` | 着手前に調査                    |
| `/think`    | 4 ファイル以上か新機能の計画    |
| `/issue`    | 計画を issue の Plan 節へ起票   |
| `/audit`    | コード品質レビュー              |
| `/commit`   | コミットメッセージを作成        |

## 2. 判断フロー

```text
即時修正か → /fix
先に理解が必要か → /research → /fix
機能を作るか → /research → /think → /issue → build workflow → /audit
```

## 3. セッション例

```bash
# 即時バグ修正
> /fix the login button is not working

# 機能開発
> /research how does auth work in this codebase?
> /think add logout functionality
> /issue

# 起票した番号を build workflow へ渡し、draft PR ができてから
> /audit
> /commit
```

## 4. キーポイント

- 一度に 1 コマンド: 各コマンドが完了してから次へ
- ワークフローを信頼する: コマンドは自然に連鎖する
- 不明なら聞く: Claude が必要なら確認する

## 5. 次のステップ

- 全コマンドは `/help` で確認
- 開発フローの詳細は[COMMANDS](./COMMANDS.md)
