# Agent-Friendly CLI Guidelines

人間とエージェントの両方にとって機能する CLI のための実践的ルール。

このドキュメントは 2026-04-02 時点で `xr`, `sae`, `notch` で揃えられている入力契約とヘルプ契約のパターンを集めたもの。選択肢を並べず、採るべき形を 1 つに絞っている。局所的な工夫より一貫性を優先する。

何を必須にするかの決定は[DR-0060](../../docs/decisions/0060-adopt-agent-friendly-cli-design-principles.md)が持つ。DR-0060 は 3 軸 (機械可読/次の手/自己発見) を必須実装として定め、このドキュメントはその 3 軸を満たす入力、ヘルプ、テストの具体形を示す。両者が食い違ったときは DR-0060 が優先する。

## なぜ

- エージェントは予測可能な入力契約を必要とする。推測すべきショートカットではない。
- `--help` だけで正しい起動パターンを発見できるべき。
- ローカル入力が無効なら、CLI は auth やネットワーク呼び出しの前に失敗すべき。
- 同じコマンドが直接起動、パイプライン、スクリプトで動作すべき。

## ベースライン

明確で強い理由がない限りこれらをデフォルトとする。

1. 非対話を優先。
2. シュガーより正準形を優先。
3. リソース的入力で `stdin` をサポート。
4. ヘルプに具体的な `Examples:`。
5. ローカル検証で fail-fast。
6. 実装だけでなくヘルプ契約をテストする。

## 正準入力契約

### 1. 単一入力値

ID、URL、screen name、検索クエリなどの単一値入力にはこのパターンを使う。

正準形:

```text
tool subcommand [ARG]
```

挙動:

- `ARG` があり `-` でなければ、そのまま使う。
- `ARG` が `-` なら、端末接続時でも `stdin` から読む。
- `ARG` が省略され `stdin` がパイプされていたら、`stdin` から読む。
- `ARG` が省略され `stdin` が端末なら、具体的な修正方法を示すローカルエラーを返す。

正準エラー形:

```text
Missing <label>. Pass <PLACEHOLDER>, pipe it via stdin, or use `-` to read stdin interactively
```

正準の空 stdin 形:

```text
No <label> provided. Pass <PLACEHOLDER>, pipe it via stdin, or use `-` to read stdin interactively
```

推奨される Rust の形:

```rust
fn resolve_input(
    value: Option<String>,
    mut stdin: impl Read,
    stdin_is_terminal: bool,
    label: &str,
    placeholder: &str,
) -> Result<String, AppError> {
    match value {
        Some(value) if value != "-" => Ok(value),
        Some(_) => read_stdin_value(&mut stdin, label, placeholder),
        None if stdin_is_terminal => Err(format!(
            "Missing {label}. Pass {placeholder}, pipe it via stdin, or use `-` to read stdin interactively"
        ).into()),
        None => read_stdin_value(&mut stdin, label, placeholder),
    }
}
```

### 2. 長文ペイロード

投稿本文、ドキュメント内容、プロンプトなど、自然にファイルサイズ程度になる入力にはこのパターンを使う。

正準形:

```text
tool subcommand --body "..."
tool subcommand --body-file draft.md
cat draft.md | tool subcommand --body-file -
```

ルール:

- インラインテキストは現実的に短いときのみサポート。
- 実コンテンツには `--body-file <path>` をサポート。
- `stdin` 用に `--body-file -` をサポート。
- 排他的なペイロード入力には `clap` の `conflicts_with` を使う。

最良の組み合わせ:

- 単一値入力: 任意の位置引数 + `stdin` フォールバック。
- 長文ペイロード入力: 明示的な `--body-file -`。

### 3. ショートハンド形式

ショートハンドは任意のシュガー。主要契約ではない。

ルール:

- 正準構文はヘルプに必ず現れる。
- ショートハンドは後方互換のためだけに存在しうる。
- ショートハンドを知らなくてもツールを使えるようにする。
- ショートハンドがパースを曖昧にしない。

現状の例:

- `sae "query"` は互換シュガーとして残しうる。
- 正準形は依然として `sae search [QUERY]`。

## ヘルプ契約

すべてのサブコマンドは `after_help` に `Examples:` を持つべき。

ルール:

- サブコマンドあたり 2〜4 例。
- 最初に正準の直接起動を示す。
- コマンドが `stdin` をサポートする場合は `stdin` の例を含める。
- `-` がサポートされる場合は `-` 形式を含める。
- フラグが挙動を実質的に変える場合は現実的なフラグ組み合わせを 1 つ含める。

ルートヘルプには自動化に影響するオペレータレベルの情報を含めるべき。

- exit コード
- 認証前提
- 出力モードの想定

ルート追加例。この形は `xr` の現状を写したもので、新規 CLI では[DR-0066](../../docs/decisions/0066-cli-exit-code-policy-grouped-by-error-topology.md)のグループ別 sysexits.h subset を使う。

```text
Exit codes:
  1  Auth
  2  NotFound
  3  Transport
  4  Api
```

## 検証順序

最も安価でローカルなものを先に検証する。

推奨順序:

1. CLI 引数のパース
2. 入力ソースの解決
3. ローカル構文・形状の検証
4. 認証/クライアントの初期化
5. ネットワークまたは DB 呼び出し

例:

- cookie 抽出の前にツイート ID をパース。
- クライアントを開く前に欠落した検索クエリを拒否。
- 排他的ペイロードフラグはパース時に拒否。

## エラー契約

エージェントフレンドリーなエラーは具体的で行動可能であるべき。

ルール:

- 何が欠けているか、何が無効かを述べる。
- どう直すかを述べる。
- 文脈なしの汎用「invalid input」は避ける。
- 共通のオペレータエラーには安定した文言を選ぶ。

良い例:

```text
Missing tweet ID or URL. Pass ID_OR_URL, pipe it via stdin, or use `-` to read stdin interactively
```

悪い例:

```text
invalid input
```

## 出力契約

ルール:

- 成功出力はナレーションで詰めず、直接利用可能であるべき。
- 警告は `stderr` へ。
- エラーは `stderr` へ。
- JSON モードがあるなら、安定して opt-in に保つ。

## テスト最低基準

このガイドラインを採用する CLI は、ハッピーパスだけでなく契約をテストすべき。

必須テスト:

1. 定義されているなら、ルートヘルプにオペレータ情報が含まれる。
2. すべてのサブコマンドが `after_help` に `Examples:` を含む。
3. `stdin` をサポートするサブコマンドはヘルプで `stdin` の例を示す。
4. 任意の位置入力は省略時に `None` としてパースされる。
5. `ARG` がパイプされた `stdin` に勝つ。
6. 省略された `ARG` はパイプされた `stdin` を読む。
7. `-` は端末上で `stdin` を読む。
8. 端末入力欠落は正準の fail-fast エラーを返す。
9. 不正な識別子に対して、認証/ネットワーク前にローカル検証が失敗する。
10. 排他的ペイロードフラグはパース時に失敗する。

あれば良いテスト:

- 後方互換のショートハンドがまだパースされる。
- JSON/グローバルフラグがショートハンド展開を壊さない。
- すべてのサブコマンドがヘルプ内容のアサーションでカバーされる。

## 正準例

### 読み取り専用リソース CLI

```text
notch fetch https://notion.so/My-Page-abc123
echo "page-id" | notch fetch
notch fetch -
```

### 読み取り専用検索 CLI

```text
sae search "keyword"
echo "keyword" | sae search
sae search -
```

### 長文ペイロード付きの変更系 CLI

```text
sae create --name "Title" --body "Content"
sae create --name "Title" --body-file draft.md
cat draft.md | sae create --name "Title" --body-file -
```

## 採用チェックリスト

CLI を「エージェントフレンドリー」と称する前に、以下をすべて確認する。

- コマンドが明示的なサブコマンドを使う。
- 正準の使用法が `--help` に見える。
- リソース的入力が `[ARG]`、パイプ `stdin`、`-` をサポートする。
- 長文コンテンツがファイル入力と `-` 経由の `stdin` をサポートする。
- ローカル入力欠落エラーが行動可能。
- 不正なローカル構文が認証/ネットワーク前に失敗する。
- 警告とエラーが成功出力と分離されている。
- ヘルプ例がテストされている。
- `stdin` の挙動がテストされている。
- exit コードの意味が定義されているなら文書化されている。

## 現行の参照実装

- `xr`: ルートに exit コード、広い任意入力サポートを持つ読み取り専用 X/Twitter CLI。
- `notch`: リソース入力解決の最もクリーンな最小パターン。
- `sae`: 検索に同じリソース入力パターン、`--body-file -` 経由で長文ペイロード入力の現行ベストパターン。

## 決定サマリ

ドメイン固有のより強い要件がない限り、このデフォルトを使う。

- 単一値入力には `notch`/`xr` パターンを踏襲。
- 長文ペイロードには `sae --body-file -` パターンを踏襲。
- ショートハンドが存在するなら、二次として残し、主要パスとしては文書化しない。
