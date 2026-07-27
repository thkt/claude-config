# スクリーニングレポートテンプレート

`/preview` が実行の最終ステップで出すレポートの骨格。会話に出力し、ファイルには保存しない。

## テンプレート

`{...}` は生成時に内容へ置き換える。

```markdown
## PR Screening Report

### Overview

{背景と目的を 2-3 文で}

### Changes Summary

| File | Change Summary |
| ---- | -------------- |

### Dependency Impact

{影響ファイル、回帰リスク}

---

### Requires Action

{`[must]` と `[want]` の findings、file:line 付き}

### Awareness

{`[imo]`, `[ask]`, `[nits]`, `[info]` のアイテム、file:line 付き}

---

### Proposed Review Comments

{ファイルでグループ化、ラベル付き}
```

## ガイドライン

`Requires Action` と `Awareness` の振り分けはラベルで決まる。ラベルの定義と重大度は SKILL.md § コメントラベルが持つ。

`Proposed Review Comments` の各コメントは SKILL.md § コメントトーンの形式に従う。ここに書いたコメントはそのまま PR へ投稿されうるので、自動投稿はしない。

`[ask]` と `[want]` 以上を出す前に、問題を到達可能なランタイム呼び出し箇所まで追跡する。追跡できないものは載せない。
