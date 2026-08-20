# Wiki README template

In Phase 1, when `docs/wiki/README.md` does not exist, /scribe writes out the content below verbatim. Nothing is substituted.

## Template

```markdown
# docs/wiki

このプロジェクトで繰り返し現れる定型手順 / 規約と再発指摘を、過去の PR/issue から蒸留して蓄積する場所。issueのPlanやレビューで毎回同じ説明 / 同じ指摘を繰り返す代わりに、ここ1箇所を参照して二重管理と陳腐化を防ぐ。

1共通項1ページで、各ページは 内容 → 定型手順 → 参照コード → 由来 → 根拠 の順。由来は共通項が派生した `docs/decisions/` の DR への参照で、その DR が supersede されたらページの書き換えが必要になる密接なものだけ張られる。根拠が 1 件だけの共通項は `_candidates.md` に置かれ、2 件目が現れたらページへ昇格する。初出でも根拠が 2 件揃っていれば直接ページになる。

## 育て方

`/scribe` スキルまたは定期巡回の scribe が、closed になった PR/issue から自動で抽出する。初回は全履歴を読んで基礎化し、以降は前回の scribe PR マージ以降に closed になった分から増分更新する。追加 / 修正はPRで提案されるので、レビューしてマージする。マージが承認になる。手動追記も可。
```
