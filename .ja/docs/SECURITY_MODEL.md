# Security Model

## Permission Evaluation Flow は UX、セキュリティではない

Claude Code の権限評価フロー (PreToolUse Hook → Deny Rules → Allow Rules → Ask Rules → Permission Mode) は tool_use ブロックをフィルタする。セキュリティ境界ではない。

LLM はテキスト生成器であり、tool_use は出力フォーマットの 1 つ。Bash が許可されたら、OS のケーパビリティはそのまま通る。ケーパビリティを実際に制限するのはプロセスサンドボックスであり、権限ルールではない。

参考: <https://zenn.dev/commander/articles/72a907ce68a8c1>

## 防御レイヤー

shields (コマンドガード、ファイル ACL、secrets チェック) は同ファミリーのバイナリだが `settings.json` へ配線しておらず、防御には数えない ([HOOKS](./HOOKS.md)の休止中を参照)。

| レイヤー            | 実装                                            | 何を止めるか                       | Bash 経由でバイパス可能か |
| ------------------- | ----------------------------------------------- | ---------------------------------- | ------------------------- |
| L1: Deny Rules      | `settings.json` の `permissions.deny` (43 件)   | 個別 tool_use ブロック             | 可                        |
| L2: PreToolUse Hook | `hooks/security/` 3 本 + `hooks/pre-bash/` 3 本 | Bash 内の危険パターン              | 部分的                    |
| L3: Process Sandbox | sandbox-runtime (`settings.json` の `sandbox`)  | ファイルシステム書込とネットワーク | 不可                      |

重要: L1 と L2 は人間の介入ポイントの調整 (UX)。L3 が実セキュリティ境界。

### L3 の現在の設定

| 項目                           | 値                                                      |
| ------------------------------ | ------------------------------------------------------- |
| `enabled`                      | true                                                    |
| `failIfUnavailable`            | true。sandbox を起動できなければ Claude Code が終了する |
| `filesystem.allowWrite`        | `~/.Trash`, `~/.claude/.git`, `~/.claude/workflows`     |
| `enableWeakerNetworkIsolation` | true                                                    |
| `excludedCommands`             | afplay, scout                                           |

## 既知のギャップ

| ギャップ                               | リスク                             | 緩和                                                                 |
| -------------------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| `excludedCommands` は sandbox 外で走る | scout がネットワークへ直接出られる | 対象を 2 コマンドに絞る。追加するときは流出経路として審査する        |
| `enableWeakerNetworkIsolation` が true | trustd 経由の流出経路が開く        | `gh` の TLS 検証に必要。無効にすると build が issue 取得段で失敗する |
| 許可ツール経由の外部送信               | scout, gh api 経由でデータ流出可能 | 正当な利用と区別できない。運用で対応                                 |
| npm/pnpm install postinstall           | 任意コード実行                     | `npm_install_guard.py` が ignore-scripts なしをブロックする          |

## チームガイドライン

| ガイドライン                        | 説明                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| deny は安全と等価でない             | deny ルールの追加だけでは完全なセキュリティ対応にならない                              |
| Bash 許可 = OS ケーパビリティの委譲 | Bash を許可すると deny ルールはバイパス可能。実際の制限は L3 が課す                    |
| hook は確率的防御                   | `hooks/security/` はパターンマッチ。未知のパスは網羅できない                           |
| bypassPermissions は隔離環境のみ    | 本番環境や開発環境で使わない                                                           |
| シークレットは環境外に保つ          | `.env` と認証情報は `permissions.deny` の Read ルールと sandbox の読み取り拒否で守る   |
| sandbox の迂回は明示の判断          | `dangerouslyDisableSandbox` と `excludedCommands` は L3 を外す。使うたびに理由を述べる |

## コンテナを使う場合

L3 を超える隔離が要るケース。

- CI/CD でエージェントを自動実行する
- 信頼できないリポジトリでエージェントを実行する
- ネットワークを遮断する必要がある (`excludedCommands` による迂回も許さない)
- コンプライアンス要件がプロセス分離を要求する

人間の監督下のローカル開発では L1 から L3 で足りる。
