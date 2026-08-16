# Research レポートテンプレート

/research が Phase 7 で生成するレポートのテンプレート。スキルが出力時に読み、`{...}` を内容へ置き換え、`${CLAUDE_SESSION_ID}` を埋めて `.claude/workspace/research/YYYY-MM-DD-<slug>.md` に保存する。

## テンプレート

各レポートは以下の構造に従う。`{...}` は生成時に置き換える。見出しに「(... のみ)」と記したセクションは、その条件を満たすときだけ含める。

```markdown
# Research: {slug}

Generated: {YYYY-MM-DD}
Session: {session-id}
Intent: {Feature planning | Bug investigation | Understanding}
Domain: {Data model | API | Infrastructure | General}
Prior research: {引き継いだファイルの slug、または "none found"}

## 目的

<!-- 1〜2 文でこの調査のゴール。$ARGUMENTS と Phase 3 の意図から導く。 -->

{... を ... のために調査する}

## Key Findings

<!-- Phase 4 の発見事項を Phase 7 で統合・ソース確認・triage したもの。優先度の高い順に全件。ソースは Phase 4 のソース記法に従う。次のアクションを持つのは triage を通過した発見のみで、紐付け先 (質問 / OUTCOME / incident) をアクション欄に添える。それ以外は「記録のみ」。 -->

| 優先度   | 発見事項   | ソース   | 次のアクション   |
| -------- | ---------- | -------- | ---------------- |
| {優先度} | {発見事項} | {ソース} | {次のアクション} |

## 利用可能なデータ

<!-- Phase 4 の出力。Type は自由記述 (File、Tech、Convention、Env、Config など)。空ならセクションを丸ごと省略。 -->

| Type   | 項目   | メモ   |
| ------ | ------ | ------ |
| {Type} | {項目} | {メモ} |

## 制約

<!-- Phase 1 の OUTCOME と Phase 2 の引き継ぎ、および Phase 4 の発見。該当なしのカテゴリ行は省略。すべて空ならセクションを丸ごと省略。 -->

| カテゴリ   | 制約   |
| ---------- | ------ |
| {カテゴリ} | {制約} |

## 仮説ログ (Bug investigation のみ)

<!-- Phase 5 の Strong Inference 出力。Intent = Bug investigation のときだけ含める。 -->

| 仮説   | 識別可能なテスト | 結果   |
| ------ | ---------------- | ------ |
| {仮説} | {テスト}         | {結果} |

## Same-origin Sweep (Bug investigation で root cause 確定時のみ)

<!-- Phase 5 の sweep 出力。root cause を確定したときだけ含める。 -->

{root cause ファイルの導入コミットと sweep 対象の説明}

| 兄弟   | Consumer (仕様ソース) | 結果   |
| ------ | --------------------- | ------ |
| {兄弟} | {consumer}            | {結果} |

## Disconfirmation チェック

<!-- Phase 7 の出力。Phase 5 を実施したときは `Covered by Phase 5 elimination` と書く。省略したときは Phase 4 の scratch から実行コマンドと生出力をそのまま引用する。0 件は「不在」と断じる前に「ツール誤用の可能性」とみなす。 -->

{Phase 5 実施時は `Covered by Phase 5 elimination`。省略時はコマンドと生出力をそのまま引用し、クロスチェック結果を添える}

## References

<!-- Findings や Evidence で引用した外部ドキュメント、Issue、過去調査ファイル。 -->

| パス   | 説明   |
| ------ | ------ |
| {パス} | {説明} |

## カバレッジ注記

<!-- Phase 6 advisor 結果 (または省略理由) と Phase 7 のカバレッジチェック。unknown と注記した質問と解消方法、cross-method 検証のツール不一致、`unverified external claim` の finding を列挙。 -->

- {unknown 項目と解消方法}
- {ツール不一致があれば記録}
- {unverified external claim があれば記録}
- Advisor: {見落とし領域なし、または省略理由}

## Next Steps

| Intent             | Next Command |
| ------------------ | ------------ |
| Feature planning   | `/think`     |
| Bug investigation  | `/fix`       |
| Understanding only | complete     |
```
