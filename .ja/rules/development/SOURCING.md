---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.mjs"
  - "**/*.cjs"
  - "**/*.rs"
  - "**/*.py"
  - "**/*.go"
  - "**/*.swift"
---

# Sourcing

framework/library の API を書くとき、学習データの記憶は固定バージョンとずれることがある。固定バージョンの公式 docs を権威ある出典とし、記憶ではなく docs に従って書く。非自明な API には出典を残す。

これは CLAUDE.md の Verify ルール「事実は出典を引用」を、framework コード生成の場面に具体化したもの。

## 適用対象

framework/library の public API に依存するコードを書く局面で適用する。

| 適用する                                                       | 適用しない                       |
| -------------------------------------------------------------- | -------------------------------- |
| 外部 framework/library の signature、option 名、default 値     | 言語標準ライブラリの安定 API     |
| バージョン依存の挙動 (lifecycle、deprecation、breaking change) | 自プロジェクト内のコード         |
| 記憶があいまい、または最後に確認してから時間が経った API       | バージョン非依存で自明な呼び出し |

## 適用手順

適用対象に該当したら、記憶から書く前に次を実行する。

1. 固定バージョンを lockfile/manifest (package.json、Cargo.toml 等) で確認し、そのバージョンの公式 docs を `scout fetch <url>` で引く。
2. docs の signature に従って書く。記憶と docs が食い違ったら docs を正とする。
3. 出典 URL をコメントまたはコミットに残す。動作を左右する非自明な API に限り、自明なものへの付与は過剰。URL は docs のトップでなく該当 API のセクション/行アンカーに deep-link する。

## docs が引けないとき

公式 docs が到達不能 (docs なし、fetch 失敗、scout 未導入) のときは、その API 使用を `unverified` として注記し、人間に知らせる。記憶を確定情報として書かない。
