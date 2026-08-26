# Agent-Friendly CLI Audit

Source: [Building CLIs for agents](https://x.com/ericzakariasson/status/2036762680401223946) by @ericzakariasson
Audit date: 2026-03-27

## Audit Criteria

Eric Zakariassonの記事から抽出した10項目。各項目をPass / Partial / Fail / N/Aで評価。

| ID   | Criteria               | Description                                              | Verification Method                 |
| ---- | ---------------------- | -------------------------------------------------------- | ----------------------------------- |
| C-01 | Non-interactive        | 全入力がフラグ/stdinで渡せる。プロンプトでブロックしない | clap定義、プロンプト系crate依存有無 |
| C-02 | Progressive discovery  | `--help`がサブコマンド単位で提供される                   | clap subcommand構造                 |
| C-03 | Help with examples     | `--help`出力に使用例が含まれる                           | clap after_help/long_about          |
| C-04 | Flags + stdin          | パイプライン対応。stdin入力サポート                      | 引数定義、stdin読み取り有無         |
| C-05 | Fast failure           | 必須フラグ欠落で即エラー + 正しい呼び出し例              | clap required、バリデーション       |
| C-06 | Idempotent             | 同一コマンド再実行が安全                                 | 状態変更コマンドの冪等性            |
| C-07 | Dry-run                | 破壊的操作に`--dry-run`フラグ                            | 破壊的コマンドの有無                |
| C-08 | Skip confirmations     | `--yes`/`--force`で確認バイパス                          | 確認プロンプトの有無                |
| C-09 | Predictable structure  | コマンド構造が一貫                                       | サブコマンド命名の一貫性            |
| C-10 | Return data on success | 成功時に構造化データを返す                               | stdout出力の内容                    |

## Audit Scope

### Hook tools（Claude Code hook経由で呼ばれる）

| CLI        | Purpose                                      | Primary consumer        |
| ---------- | -------------------------------------------- | ----------------------- |
| shields    | コマンドガード + ファイルACL + secrets check | PreToolUse hook         |
| guardrails | oxlint/biome lint + カスタムルール           | PreToolUse hook         |
| formatter  | oxfmt/biome format + EOF newline             | PostToolUse hook        |
| reviews    | knip, oxlint, tsgo, react-doctor 並列実行    | PreToolUse hook         |
| gates      | lint/type-check/test/knip 並列ゲート         | Stop hook               |
| chronicler | file:line参照の陳腐化検知                    | PostToolUse + Stop hook |

### Standalone CLIs（エージェントがBash経由で直接使用）

| CLI    | Purpose                                |
| ------ | -------------------------------------- |
| kiku   | Slack会話セマンティック検索            |
| recall | セッションログ検索                     |
| scout  | URL fetch + web search + repo overview |
| xr     | X/Twitter データ取得                   |
| yomu   | コードベースセマンティック検索         |
| tally  | エンジニア工数自動記録                 |
| mado   | Claude Codeセッションモニター TUI      |
| notch  | Notion → Markdown変換                  |
| litmus | テスト品質リンター                     |
| mimi   | 音声AIミーティングアシスタント TUI     |
| sae    | esa記事セマンティック検索              |

### Excluded

| Name   | Reason                                                        |
| ------ | ------------------------------------------------------------- |
| rurico | 共有ライブラリ（embedding + vector storage）。CLIバイナリなし |

## Results Matrix

P = Pass(1), H = Partial(0.5), F = Fail(0), - = N/A(除外)

| CLI        | C-01 | C-02 | C-03 | C-04 | C-05 | C-06 | C-07 | C-08 | C-09 | C-10 | Score |
| ---------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ----- |
| scout      | P    | P    | H    | P    | P    | P    | -    | -    | P    | P    | 94%   |
| shields    | P    | P    | H    | P    | P    | P    | -    | -    | P    | P    | 94%   |
| reviews    | P    | -    | -    | H    | P    | P    | -    | P    | P    | P    | 93%   |
| chronicler | P    | F    | H    | P    | P    | P    | -    | P    | P    | P    | 83%   |
| xr         | P    | P    | H    | F    | P    | P    | -    | -    | P    | P    | 81%   |
| notch      | P    | P    | H    | F    | P    | P    | -    | -    | P    | P    | 81%   |
| guardrails | P    | -    | -    | P    | P    | P    | -    | -    | -    | F    | 80%   |
| yomu       | P    | P    | P    | F    | P    | P    | F    | -    | P    | P    | 78%   |
| recall     | P    | P    | F    | H    | P    | P    | -    | -    | P    | H    | 75%   |
| formatter  | P    | -    | -    | H    | P    | P    | F    | P    | P    | F    | 69%   |
| litmus     | P    | -    | F    | F    | P    | P    | -    | -    | P    | H    | 64%   |
| kiku       | P    | H    | F    | F    | P    | P    | F    | -    | P    | H    | 56%   |
| tally      | H    | P    | F    | F    | P    | P    | -    | -    | H    | H    | 56%   |
| sae        | P    | P    | F    | F    | P    | H    | F    | -    | P    | H    | 56%   |
| gates      | P    | F    | F    | F    | P    | P    | -    | -    | P    | F    | 50%   |
| mado       | F    | F    | F    | F    | -    | P    | -    | -    | F    | F    | 14%   |
| mimi       | F    | F    | F    | F    | F    | H    | -    | -    | F    | H    | 13%   |

## Cross-Cutting Analysis

### 全体傾向

| Criteria             | Pass率             | 所見                                                      |
| -------------------- | ------------------ | --------------------------------------------------------- |
| C-01 Non-interactive | 82% (14P/1H/2F)    | TUIアプリ（mado, mimi）以外は達成。Hook toolsは設計上Pass |
| C-05 Fast failure    | 88% (15P/0H/1F/1-) | clap + カスタムバリデーションでおおむね達成                   |
| C-06 Idempotent      | 91% (15P/1H/0F/1-) | 読み取り専用ツールが多く自然に達成                        |
| C-09 Predictable     | 76% (12P/1H/2F/2-) | clap subcommand構造が一貫性を保証                         |
| C-02 Progressive     | 60% (8P/1H/3F/5-)  | Hook toolsはN/Aが多い。gates, chroniclerが未実装          |
| C-10 Return data     | 53% (8P/4H/4F/1-)  | 構造化出力（JSON）の欠如が最大の弱点                      |
| C-03 Help examples   | 13% (1P/5H/9F/2-)  | ほぼ全CLIで不足。yomuのみPass                             |
| C-04 Flags + stdin   | 31% (4P/3H/9F/1-)  | stdin未対応が多数。パイプライン非対応                     |
| C-07 Dry-run         | 0% (0P/0H/4F/13-)  | 該当CLIで全滅。kiku, yomu, saeのindex/harvestに必要       |

### 共通の弱点 Top 3

1. C-03 Help with examples - READMEに例はあるが`--help`出力に含まれていない（15/17 CLIで不足）
2. C-04 Flags + stdin - stdin入力をサポートしているCLIが少ない（パイプライン非対応）
3. C-10 Return data - 人間可読テキスト出力のみで`--json`フラグがない（構造化出力の欠如）

### 優先度別改善マップ

| Priority | Action                                    | 対象CLI                                                        | Effort |
| -------- | ----------------------------------------- | -------------------------------------------------------------- | ------ |
| P0       | `--json`出力フラグ追加                    | gates, formatter, guardrails, kiku, recall, tally, litmus, sae | Medium |
| P1       | `--help`にexamples追加（clap after_help） | 全CLI（yomu以外）                                              | Low    |
| P2       | `--help`実装（clap導入）                  | gates, chronicler, litmus                                      | Low    |
| P3       | stdin入力サポート                         | kiku, xr, recall, notch, litmus, sae                           | Medium |
| P3       | `--dry-run`追加                           | kiku harvest, yomu rebuild, sae create/archive                 | Low    |
| P4       | mado非インタラクティブモード              | mado (list/export サブコマンド)                                | High   |

## Detailed Findings

### shields (94%)

Security hook: コマンドガード + ファイルACL + secrets check

| Criteria | Rating  | Evidence                                               |
| -------- | ------- | ------------------------------------------------------ |
| C-01     | Pass    | stdin JSON only。dialoguer/inquire依存なし             |
| C-02     | Pass    | check, aclの2サブコマンド。clap derive                 |
| C-03     | Partial | doc commentあるが使用例なし。READMEにのみ例あり        |
| C-04     | Pass    | 純粋stdin駆動。`echo JSON \| shields check`            |
| C-05     | Pass    | 不正JSON → fail-closed (block/deny)。exit codeで区別   |
| C-06     | Pass    | 読み取り専用。設定は毎回ロード                         |
| C-07     | N/A     | 破壊操作なし（ガードのみ）                             |
| C-08     | N/A     | 確認プロンプトなし                                     |
| C-09     | Pass    | `shields <subcommand>` 一貫パターン                    |
| C-10     | Pass    | 構造化JSON (Decision: block/deny/ask/approve + reason) |

Recommendations:

- `--help`にstdin JSONスキーマの例を追加

### guardrails (80%)

PreToolUse hook: oxlint/biome lint + カスタムセキュリティルール

| Criteria | Rating | Evidence                                                        |
| -------- | ------ | --------------------------------------------------------------- |
| C-01     | Pass   | stdin JSON only。プロンプト系crateなし                          |
| C-02     | N/A    | Hook。サブコマンドなし                                          |
| C-03     | N/A    | Hook。CLI helpの概念なし                                        |
| C-04     | Pass   | 純粋stdin設計。サイズ制限10MB                                   |
| C-05     | Pass   | 不正JSON → exit 1、超過 → exit 2、設定エラー → デフォルトで継続 |
| C-06     | Pass   | 読み取り専用lint。冪等                                          |
| C-07     | N/A    | 破壊操作なし                                                    |
| C-08     | N/A    | 確認プロンプトなし                                              |
| C-09     | N/A    | サブコマンドなし                                                |
| C-10     | Fail   | stderrに人間可読テキストのみ。JSON出力なし                      |

Recommendations:

- `GUARDRAILS_JSON=1` env varでJSON出力モード追加
- violation構造: `{"violations": [{"rule", "severity", "file", "line", "fix"}]}`

### formatter (69%)

PostToolUse hook: oxfmt/biome format + EOF newline

| Criteria | Rating  | Evidence                                          |
| -------- | ------- | ------------------------------------------------- |
| C-01     | Pass    | stdin JSON + 設定ファイル。プロンプトなし         |
| C-02     | N/A     | Hook。サブコマンドなし                            |
| C-03     | N/A     | Hook。CLI helpなし                                |
| C-04     | Partial | stdinあるがフラグでの上書きなし                   |
| C-05     | Pass    | JSON parse即エラー。パス検証で早期リターン        |
| C-06     | Pass    | formatter冪等。EOF newlineも冪等                  |
| C-07     | Fail    | ファイルをin-place変更するが`--dry-run`なし       |
| C-08     | Pass    | 確認なしで即実行                                  |
| C-09     | Pass    | 入力構造固定。エラーメッセージ一貫 ("Formatter:") |
| C-10     | Fail    | 成功時は無出力。エラーもstderrテキストのみ        |

Recommendations:

- exit code区別（0=成功, 1=エラー, 2=no-op）
- 成功時にJSON（formatted file, formatter used）をstdoutへ

### reviews (93%)

PreToolUse hook: knip, oxlint, tsgo, react-doctor並列実行

| Criteria | Rating  | Evidence                                                 |
| -------- | ------- | -------------------------------------------------------- |
| C-01     | Pass    | stdin JSON。プロンプトなし                               |
| C-02     | N/A     | Hook                                                     |
| C-03     | N/A     | Hook                                                     |
| C-04     | Partial | stdin対応だがフラグでの個別ツール制御なし                |
| C-05     | Pass    | サイズ超過/cwd失敗で即exit。config失敗はデフォルトで継続 |
| C-06     | Pass    | 読み取り専用。全ツール並列実行で冪等                     |
| C-07     | N/A     | 破壊操作なし                                             |
| C-08     | Pass    | 常にapprove。確認なし                                    |
| C-09     | Pass    | ツール名一貫。JSON出力構造不変                           |
| C-10     | Pass    | 構造化JSON（decision + additionalContext）               |

Recommendations:

- `--disable-tool=knip`等のフラグで個別制御

### gates (50%)

Stop hook: lint/type-check/test/knip並列ゲート

| Criteria | Rating | Evidence                                                             |
| -------- | ------ | -------------------------------------------------------------------- |
| C-01     | Pass   | 位置引数（ディレクトリ）のみ。プロンプトなし                         |
| C-02     | Fail   | `--help`未実装。usage文字列のみ                                      |
| C-03     | Fail   | 使用例なし。READMEにのみ                                             |
| C-04     | Fail   | フラグなし。設定は.claude/tools.json固定                             |
| C-05     | Pass   | ディレクトリ存在チェック即exit                                       |
| C-06     | Pass   | 読み取り専用検証。冪等                                               |
| C-07     | N/A    | 破壊操作なし                                                         |
| C-08     | N/A    | 確認なし                                                             |
| C-09     | Pass   | ゲート名一貫（knip, tsgo, circular, litmus, lint, type-check, test） |
| C-10     | Fail   | 失敗時のみJSON。成功時は無出力                                       |

Recommendations:

- clap導入で`--help`対応
- `--json`フラグでゲート別結果JSON出力
- `--list-gates`でアクティブゲート一覧

### chronicler (83%)

PostToolUse + Stop hook: file:line参照の陳腐化検知

| Criteria | Rating  | Evidence                                                   |
| -------- | ------- | ---------------------------------------------------------- |
| C-01     | Pass    | 位置引数 + stdin JSON。isatty検出                          |
| C-02     | Fail    | `--help`未実装。unknownコマンドでgenericエラー             |
| C-03     | Partial | READMEに例あり。CLI helpなし                               |
| C-04     | Pass    | stdin JSON対応。パイプ検出                                 |
| C-05     | Pass    | unknownコマンドで即exit。ディレクトリ検証あり              |
| C-06     | Pass    | テンプレート書き込みは既存スキップ。config作成もcreate_new |
| C-07     | N/A     | 観察のみ（読み取り + mtime比較）                           |
| C-08     | Pass    | 確認なしでJSON decision出力                                |
| C-09     | Pass    | edit, init, update, check, test-docsの5コマンド一貫        |
| C-10     | Pass    | 構造化JSON（decision + reason + additionalContext）        |

Recommendations:

- clap導入で`--help`対応（最小限でも）
- `--version`フラグ

### kiku (56%)

Slack会話セマンティック検索

| Criteria | Rating  | Evidence                                                            |
| -------- | ------- | ------------------------------------------------------------------- |
| C-01     | Pass    | clap derive。プロンプトなし                                         |
| C-02     | Partial | サブコマンドhelp stringあるが例なし                                 |
| C-03     | Fail    | CLAUDE.mdに例あるが`--help`になし                                   |
| C-04     | Fail    | stdin未対応。パイプライン非対応                                     |
| C-05     | Pass    | チャンネルIDバリデーション即実行。クライアント/embedder事前チェック |
| C-06     | Pass    | hash重複排除。UPSERT。cursor-based sync                             |
| C-07     | Fail    | harvestがDB変更するが`--dry-run`なし                                |
| C-08     | N/A     | 確認なし                                                            |
| C-09     | Pass    | harvest, search, statusの3コマンド一貫                              |
| C-10     | Partial | 人間可読テキスト。JSON出力なし                                      |

Recommendations:

- `--json`フラグ追加
- `--dry-run`でharvest対象プレビュー
- `--help`にexamples追加

### recall (75%)

セッションログ全文 + セマンティック検索

| Criteria | Rating  | Evidence                                          |
| -------- | ------- | ------------------------------------------------- |
| C-01     | Pass    | clap derive + 後方互換shorthand                   |
| C-02     | Pass    | index, search, show, status各レベルで`--help`     |
| C-03     | Fail    | READMEにのみ例。`--help`になし                    |
| C-04     | Partial | 豊富なフラグ。stdin未対応                         |
| C-05     | Pass    | clap必須引数 + exit code区別（1=user, 2=system）  |
| C-06     | Pass    | index増分。mtime検査でスキップ。--forceで全再構築 |
| C-07     | N/A     | indexは増分で安全                                 |
| C-08     | N/A     | 確認なし                                          |
| C-09     | Pass    | index, search, show, status一貫。フラグ命名統一   |
| C-10     | Partial | 構造化テキストだがJSON出力なし                    |

Recommendations:

- `--json`フラグで検索結果をJSON出力
- `--help`にexamples追加

### scout (94%)

Web search + fetch + GitHub repo overview

| Criteria | Rating  | Evidence                                                         |
| -------- | ------- | ---------------------------------------------------------------- |
| C-01     | Pass    | clap derive。全入力フラグ/位置引数                               |
| C-02     | Pass    | 各サブコマンドにdoc comment。`--help`完備                        |
| C-03     | Partial | フラグ説明あるが使用例なし                                       |
| C-04     | Pass    | フラグ完備。stdout/stderr分離                                    |
| C-05     | Pass    | clap必須引数。exit code区別（1=user, 2=internal）                |
| C-06     | Pass    | 純粋読み取り。ローカル状態変更なし                               |
| C-07     | N/A     | 破壊操作なし                                                     |
| C-08     | N/A     | 確認なし                                                         |
| C-09     | Pass    | search, fetch, research, repo-tree, repo-read, repo-overview一貫 |
| C-10     | Pass    | 構造化Markdown。メタデータ + ソースリスト                        |

Recommendations:

- `--help`にexamples追加
- `--output json`でJSON出力オプション

### xr (81%)

読み取り専用Twitter/X CLI

| Criteria | Rating  | Evidence                                                              |
| -------- | ------- | --------------------------------------------------------------------- |
| C-01     | Pass    | clap derive。全コマンド非インタラクティブ                             |
| C-02     | Pass    | 各コマンドにdoc comment。clap v4                                      |
| C-03     | Partial | 説明あるが例なし                                                      |
| C-04     | Fail    | stdin未対応。検索クエリは位置引数のみ                                 |
| C-05     | Pass    | clap必須引数。exit code区別（1=Auth, 2=NotFound, 3=Transport, 4=Api） |
| C-06     | Pass    | 全操作が読み取り専用                                                  |
| C-07     | N/A     | 破壊操作なし                                                          |
| C-08     | N/A     | 確認なし                                                              |
| C-09     | Pass    | Feed, Search, Tweet, Article, User, UserPosts, Bookmarks, List一貫    |
| C-10     | Pass    | YAML frontmatter + Markdown。構造化メタデータ                         |

Recommendations:

- `--help`にexamples追加
- exit code一覧を`--help`に記載

### yomu (78%)

コードベースセマンティック検索

| Criteria | Rating | Evidence                                                                |
| -------- | ------ | ----------------------------------------------------------------------- |
| C-01     | Pass   | clap derive。全入力フラグ/位置引数                                      |
| C-02     | Pass   | search, index, rebuild, impact, status各レベルhelp                      |
| C-03     | Pass   | READMEに実出力つき例。フラグにデフォルト・制約記載                      |
| C-04     | Fail   | stdin未対応                                                             |
| C-05     | Pass   | value_parserで範囲検証。空クエリ/長さチェック。exit code区別            |
| C-06     | Pass   | indexはhashチェックでスキップ。rebuildも再実行安全                      |
| C-07     | Fail   | rebuild/indexに`--dry-run`なし                                          |
| C-08     | N/A    | 確認なし                                                                |
| C-09     | Pass   | 5サブコマンド一貫。フラグ命名統一                                       |
| C-10     | Pass   | 構造化テキスト（rank, type, line range, similarity, imports, siblings） |

Recommendations:

- `--dry-run`でindex/rebuild対象プレビュー
- stdin対応（`yomu search < query.txt`）

### tally (56%)

エンジニア工数自動記録

| Criteria | Rating  | Evidence                                                 |
| -------- | ------- | -------------------------------------------------------- |
| C-01     | Partial | フラグ/デフォルトで非インタラクティブ。stdin未対応       |
| C-02     | Pass    | init, status, report, log, export各サブコマンドhelp      |
| C-03     | Fail    | 説明最小限。例なし                                       |
| C-04     | Fail    | stdin未対応。データはファイルベース                      |
| C-05     | Pass    | projects.toml未検出で即エラー + `Run 'tally init'`ガイド |
| C-06     | Pass    | 読み取り専用。initは既存ファイルスキップ                 |
| C-07     | N/A     | 破壊操作なし                                             |
| C-08     | N/A     | 確認なし                                                 |
| C-09     | Partial | コマンド名一貫。`export --csv`のフラグパターンが微妙     |
| C-10     | Partial | CSV export対応。JSON出力なし                             |

Recommendations:

- `--json`フラグでreport/log/statusのJSON出力
- `export --format csv\|json`に統一
- `--help`にexamples追加

### mado (14%)

Claude Codeセッションモニター TUI

| Criteria | Rating | Evidence                                   |
| -------- | ------ | ------------------------------------------ |
| C-01     | Fail   | TUIアプリ。キーボード/マウスイベントループ |
| C-02     | Fail   | サブコマンドなし。`--config`のみ           |
| C-03     | Fail   | help最小限。例なし                         |
| C-04     | Fail   | stdin未対応。パイプライン非対応            |
| C-05     | N/A    | 必須フラグなし                             |
| C-06     | Pass   | 読み取り専用モニター                       |
| C-07     | N/A    | 破壊操作なし                               |
| C-08     | N/A    | 確認なし                                   |
| C-09     | Fail   | サブコマンドなし。単一TUI                  |
| C-10     | Fail   | TUI表示のみ。構造化出力なし                |

Recommendations:

- `mado list --json`で非インタラクティブモード追加
- TUIを`mado watch`に移動、デフォルトを非インタラクティブに
- `mado list --status running --format json`でフィルタ対応

### notch (81%)

Notion → Markdown変換

| Criteria | Rating  | Evidence                                            |
| -------- | ------- | --------------------------------------------------- |
| C-01     | Pass    | 位置引数 + 環境変数（NOTION_TOKEN）。プロンプトなし |
| C-02     | Pass    | fetch, search, query各サブコマンドhelp              |
| C-03     | Partial | doc commentあるが例なし                             |
| C-04     | Fail    | stdin未対応。page IDは位置引数のみ                  |
| C-05     | Pass    | NOTION_TOKEN欠落で即exit。page ID形式チェック       |
| C-06     | Pass    | 読み取り専用                                        |
| C-07     | N/A     | 破壊操作なし                                        |
| C-08     | N/A     | 確認なし                                            |
| C-09     | Pass    | fetch, search, query一貫（verb pattern）            |
| C-10     | Pass    | Markdown + TSV（search/query）。構造化出力          |

Recommendations:

- stdin対応（`echo "page-id" | notch fetch`）
- `--json`オプション

### litmus (64%)

テスト品質リンター

| Criteria | Rating  | Evidence                                                     |
| -------- | ------- | ------------------------------------------------------------ |
| C-01     | Pass    | 位置引数（ディレクトリ）のみ。プロンプトなし                 |
| C-02     | N/A     | サブコマンドなし（単一スキャンモード）                       |
| C-03     | Fail    | `--help`未実装。使用法表示なし                               |
| C-04     | Fail    | フラグなし。stdin未対応                                      |
| C-05     | Pass    | デフォルト`.`にフォールバック。parseエラーはstderrでスキップ |
| C-06     | Pass    | 読み取り専用。副作用なし                                     |
| C-07     | N/A     | 破壊操作なし                                                 |
| C-08     | N/A     | 確認なし                                                     |
| C-09     | Pass    | 単一コマンド。ルール名一貫（kebab-case）                     |
| C-10     | Partial | `rule: file:line test_name (detail)`形式。JSON未対応         |

Recommendations:

- clap導入で`--help` + `--rules` + `--json`
- stdin対応（`git diff --name-only | litmus --stdin`）

### mimi (13%)

音声AIミーティングアシスタントTUI

| Criteria | Rating  | Evidence                                                     |
| -------- | ------- | ------------------------------------------------------------ |
| C-01     | Fail    | TUI + 音声入力。ブロッキングイベントループ                   |
| C-02     | Fail    | サブコマンドなし。CLI引数パースなし                          |
| C-03     | Fail    | help未実装                                                   |
| C-04     | Fail    | CLI引数なし。音声デバイス固定                                |
| C-05     | Fail    | env varチェックあるがTUIがハング可能                         |
| C-06     | Partial | DB操作は冪等。ミーティングファイルはタイムスタンプで重複回避 |
| C-07     | N/A     | 追記のみ                                                     |
| C-08     | N/A     | 確認なし                                                     |
| C-09     | Fail    | コマンド構造なし                                             |
| C-10     | Partial | 終了時にミーティングログパスを出力                           |

Recommendations:

- `mimi query "transcript" --output file.md`でバッチモード追加
- TUIを`mimi listen`に分離

### sae (56%)

esa記事セマンティック検索

| Criteria | Rating  | Evidence                                                            |
| -------- | ------- | ------------------------------------------------------------------- |
| C-01     | Pass    | clap derive。プロンプトなし                                         |
| C-02     | Pass    | harvest, search, get, create, update, archive, ship, embed, status  |
| C-03     | Fail    | doc commentのみ。例なし                                             |
| C-04     | Fail    | stdin未対応。`--body`フラグのみ                                     |
| C-05     | Pass    | チーム未設定で即エラー + ガイドメッセージ。ESA_ACCESS_TOKENチェック |
| C-06     | Partial | harvest冪等。createは冪等でない（2回実行で2記事）                   |
| C-07     | Fail    | create/archive/shipに`--dry-run`なし                                |
| C-08     | N/A     | 確認なし                                                            |
| C-09     | Pass    | 9サブコマンド一貫                                                   |
| C-10     | Partial | getはYAML。search/createは人間可読テキスト                          |

Recommendations:

- `--json`フラグ追加
- `--dry-run`でcreate/archive/shipプレビュー
- stdin対応（`--body`の代わりにパイプ）
- create冪等性（`--idempotent-key`）
