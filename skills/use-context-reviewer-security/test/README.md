# use-context-reviewer-security のテストハーネス

reviewer-security の検出精度を客観評価するためのテストハーネス。LLM の主観 confidence ではなく、Recall / FP Rate という外部基準で精度を測る。

## ゴール

| 指標               | 計算                                             | 意味           |
| ------------------ | ------------------------------------------------ | -------------- |
| Recall             | 検出された vuln-cases 数 / 全 vuln-cases 数      | 見逃し率の逆   |
| FP Rate            | findings が出た safe-cases 数 / 全 safe-cases 数 | 過剰検出率     |
| Recall by category | カテゴリ別 (A01-A10) Recall                      | 軸別の弱点把握 |
| Diff from previous | results/ の前回ログとの差分                      | 回帰検知       |

## 構成

```
test/
├── README.md            # この文書
├── expected.json        # 期待値定義 (検出すべき / 検出すべきでない)
├── cases/
│   ├── vuln/            # 検出されるべき (positive)
│   ├── safe/            # 検出されてはいけない (negative)
│   └── cross-file/      # 複数ファイル合わせて初めて検出される
└── results/             # 実行結果ログ (gitignored)
```

## 使い方

現状は手動実行。runner はハーネスが育ってから実装する。

測定は blind protocol で行う。dispatch prompt にラベル・期待値・脆弱性ヒントを含めると Recall が汚染される (2026-06-04 判明、旧ベースライン無効化)。

1. cases を一時ディレクトリに中立名でコピー (case-01.ts のように連番、vuln/safe を交互に)。`./db` などフレームワーク規約名は文脈なので保持
2. reviewer-security agent を Agent tool で起動。prompt には対象パス・出力フォーマット・cross-file ペアの関連性のみ記載。「vuln」「safe」「テスト」「期待」の語と各ファイルの脆弱性説明は禁止
3. 照合基準を dispatch 前に固定する。後出しで基準を動かさない
4. 結果を `expected.json` と照合し `results/YYYY-MM-DD-*.json` に記録

注: 連番命名とペア構造から agent が「テスト集合」と推測しうる (2026-06-04 観測)。完全な blind には現実的な scaffolding への埋め込みが要るが、現状はラベル漏洩の除去を優先する。

## expected.json スキーマ

```json
[
  {
    "file": "cases/vuln/<name>.ts",
    "expected": "detected",
    "category": "A03",
    "severity_min": "high",
    "difficulty": "easy" | "hard" | "cross-file",
    "min_findings": 1,
    "note": "<任意の補足>"
  },
  {
    "file": "cases/safe/<name>.ts",
    "expected": "no_finding",
    "note": "<安全である理由>"
  }
]
```

`min_findings` は省略時 1。複数の独立した脆弱性が同一ファイルに含まれる場合のみ明示する (例: cross-file/middleware.ts は matcher gap と unsigned cookie role の 2 件)。

`notes` (複数形) は `min_findings` の各件について何を期待しているかを列挙するときに使う。

## 出典

cases の構成・難易度カテゴリの考え方は [sabakan0123/claude-security-scan](https://github.com/sabakan0123/claude-security-scan) (MIT) の `tests/security-skills/` を参考にしている。コードは reviewer-security の検出パターン (OWASP A01-A10) に合わせて自前で書いた。
