---
name: adrift
description: ADR の Decision Outcome セクションと現コードの drift を体系スキャンし、修正方向と優先度付きレポートを生成。ADR が無いリポジトリでは /census を先に使う。
when_to_use: ADR と コードの整合性確認, ADR drift, ADR vs code, ADR audit, 意思決定の風化チェック, decision record divergence
allowed-tools: Read Write LS Bash(mkdir:*) Bash(date:*) Bash(python3:*) Bash(ugrep:*) Bash(bfs:*) Task AskUserQuestion
model: opus
argument-hint: "[adr-directory]"
---

# /adrift - ADR とコードの drift スキャナー

各 ADR の Decision Outcome セクションと現コードを照合し、drift を `file:line` + 修正方向 + 優先度で記録する。ADR をリファクタリングの整理基準として使えるようギャップを可視化する。

## 入力

`$ARGUMENTS` は単一の ADR ディレクトリパスを含み得る。空白を除去し、空文字列は自動検出 (Phase 1) として扱う。非空ならリポジトリルート相対パスとして扱い、存在しなければ却下する。

## Phase 1: ADR 検出

`docs/decisions/` のみを ADR ディレクトリとして扱う。存在しなければ ADR 無しとして扱い、"No ADRs found, run /census first" で中断する。`$ARGUMENTS` で別パスが明示された場合のみそれを使う。

## Phase 2: status 抽出

各 ADR の front matter または冒頭セクションから status を解析。`superseded by [...]` リンクで後継 ADR を辿る。

## Phase 3: Decision Outcome からのシンボル抽出

各 ADR の `## Decision Outcome` セクションからコード識別子 (関数名 / 型名 / モジュール名 / ファイルパス) と箇条書き単位の決定事項を抽出。散文のみの ADR は "unverifiable, prose-only" として記録。

## Phase 4: 参照検索

抽出した各シンボルに以下を適用する。

- `ugrep -r "<symbol>"` で文字列一致
- ADR ファイル自体とテスト fixture は除外

### External ADR クロスチェック

`python3 ${CLAUDE_SKILL_DIR}/../_lib/external-adr-refs.py --adr-dir <adr-dir> --json` を実行する。コードベースの `ADR-NNNN` 参照を Phase 1 で検出した ADR ディレクトリの `NNNN-*.md` と突き合わせ、ローカルに無い ID を `external_refs` として返す。これを External ADR 依存として別セクションに記録する。メタ ADR が別リポジトリにあるがローカルに未昇格の場合を捕捉する。

## Phase 5: Reviewer 選択

マニフェストファイルでリポジトリ言語を判定し、対応する reviewer subagent を Task で起動。subagent には候補 `file:line` リストと ADR の Decision Outcome 本文を渡す。clippy や grep で拾えない意味的ギャップを判定させる。

| マニフェスト              | 起動する reviewer subagent               |
| ------------------------- | ---------------------------------------- |
| Cargo.toml                | reviewer-rust + reviewer-design          |
| package.json              | reviewer-design                          |
| package.json with `*.tsx` | reviewer-react-pattern + reviewer-design |
| その他 / 不明             | reviewer-design                          |

## Phase 6: 修正方向

| 方向         | 判定基準                                         |
| ------------ | ------------------------------------------------ |
| `code-fix`   | ADR が現契約として正しく、コードが drift         |
| `adr-update` | コードが現契約として正しく、ADR が陳腐化         |
| `accept`     | drift が些末 or 非推奨コメント or ドキュメント済 |

## Phase 7: 優先度

| 優先度 | 判定基準                                     |
| ------ | -------------------------------------------- |
| H      | 公開 API に影響、または下流利用側が 2 つ以上 |
| M      | 内部 API に影響、下流利用側は 1 つ           |
| L      | コメント / docstring のみ、または無効な参照  |

## Phase 8: レポート出力

`${CLAUDE_SKILL_DIR}/templates/report-template.md` に従い、placeholder を検出事項から置換してレポートを書く。書き終えたら ADR 数 / 検出事項数 / 優先度別件数内訳 / unverifiable 数 をコンソールに出力する。

```bash
mkdir -p docs/audit
STAMP=$(date -u +%Y-%m-%d-%H%M%S)  # UTC date + HHMMSS; same-day reruns never collide
REPORT="docs/audit/${STAMP}-adr-drift.md"
```

## 引き継ぎ

- 優先度 H の後続候補を表示し、`/issue` で個別起票するかをユーザーに確認
- 本 skill は drift 検出とレポートに徹し、adr-update 方向の検出事項と ADR 本文編集は `/adr` に引き継ぐ
- 実コード修正は別作業。ADR が無い領域の発掘は `/census` を使用

## 完了条件

以下をすべて満たしたときのみ終了する。満たせない項目は理由をレポートに記録する。

| 項目     | 条件                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| レポート | `docs/audit/<YYYY-MM-DD>-<HHMMSS>-adr-drift.md` が存在                                                              |
| Per-ADR  | 各 ADR を Per-ADR Findings に漏れなく記載 (drift / unverifiable は個別サブセクション、no drift は 1 行に束ねてよい) |
| 検出事項 | 各 drift に file:line / direction / priority を記録                                                                 |
| Status   | superseded ADR の Status に `Superseded` を反映                                                                     |
| External | External ADR 参照があれば External ADR Dependencies に記録                                                          |
