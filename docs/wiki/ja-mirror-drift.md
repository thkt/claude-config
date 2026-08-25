---
globs: ["**/.ja/**/*"]
scenes: []
---

# ja-mirror 同期漏れ (drift)

## 内容

.ja/ を canonical として編集し EN を同一コミットでミラーする運用 (`rules/conventions/MIRROR.md`、DR-0073) の下で、移行・削除を伴う変更時に片側ツリーへの反映が漏れ、dead な参照や promise タグが残る drift が繰り返し発生している。規約そのものは rules にあるが、規約だけでは防げていないため、変更時の両ツリー全域 grep を手順として固定する。

散文の言語が入れ替わる drift は hook と走査テストが機械的に拾うようになった。手順が守るのは残りの 2 つで、片側だけに残る参照と、解析のアンカーが両ツリーで割れる形。

## 定型手順

1. .ja/ を先に編集し、EN ミラーを同一コミットで反映する
2. 移行・削除・rename を伴う変更では、ugrep で .ja と EN の両ツリー全域を検索し残存参照ゼロを確認する
3. ugrep の alternation は ERE で `a|b` と書く。`\|` は literal 扱いになり grep が空振りする
4. 構造を持つミラー (script や fixture) は行数一致や AST 同一で検証する
5. script が literal で探す見出しは、翻訳せず両ツリーで同じ綴りにする。解析のアンカーは散文ではない

## 参照コード

- `rules/conventions/MIRROR.md` の Canonical side and mirroring (canonical の向きと、形の決め方)
- `hooks/_lib/mirror_prose.py` の `check_english` と `is_english_target` (英語側に残った日本語 prose を拾う)
- `hooks/edit/mirror_prose_guard.py` (編集のたびに 1 ファイルを見る PostToolUse hook)
- `hooks/_lib/tests/mirror_prose_test.py` (hook が見ていない間に入った分をリポジトリ全域で走査する)

## 由来

- `docs/decisions/0073-adopt-ja-as-canonical-source-for-mirror.md`

## 根拠

- #55 ADR-0025 の /goal 移行が .ja 未反映で、ja 側に dead promise タグが残存した
- #57 ralph-loop 参照が en 側は全削除済みなのに ja 側 4 ファイルに取り残されていた。ugrep の `\|` 誤用で grep が 2 度空振りした
- #144 逆方向の drift。.ja/skills/swarm は削除済みだが EN 側が残存していた
- #169 anchorless な .gitignore ルールにより .ja 側の test fixture 9 件が silently 欠落していた
- #60 drift 事例の再発を受けて JA canonical + 同一コミット規律を DR-0073 に明文化した
- #389 13 テンプレートの骨格見出しが `## テンプレート` と `## Template` に割れていた。issue の parser が literal で探すアンカーなので、`.ja` を骨格として渡すと節が 1 つ増えていた
- #390 英語側の py が全文書き換えで日本語 prose を失う drift が 4 件あり、逆向きの検出を hook と走査テストへ足した
