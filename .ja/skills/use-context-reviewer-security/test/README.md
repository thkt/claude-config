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

```text
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

プロトコル、verdict の集合、expected.json のスキーマは `skills/_lib/review-harness.md` にある。ここにはこのハーネス固有の事情だけを置く。

blind protocol の漏れはここで 2026-06-04 に見つかった。過去のベースライン (2026-05-02 easy、2026-05-02 hard、2026-05-07 llm01) は prompt に vuln/safe のディレクトリの役割を書いており、hard の回はさらに各ファイルの脆弱性を説明していた。これらの Recall は汚染されている。モデルも違う (opus-4-7 と opus-4-8) ので、差分はプロトコルとモデルの混合になる。

`cases/cross-file/` のペアは複数ファイルを合わせて初めて検出できるので、dispatch prompt にはペアの関連性だけを書く。このハーネスが agent へ渡す唯一の構造がこれ。

`min_findings` は 1 ファイルに独立した脆弱性が複数あるときだけ書く (cross-file/middleware.ts は matcher gap と unsigned cookie role の 2 件)。`notes` (複数形) はその各件に何を期待するかを列挙する。

## 出典

cases の構成・難易度カテゴリの考え方は [sabakan0123/claude-security-scan](https://github.com/sabakan0123/claude-security-scan) (MIT) の `tests/security-skills/` を参考にしている。コードは reviewer-security の検出パターン (OWASP A01-A10) に合わせて自前で書いた。
