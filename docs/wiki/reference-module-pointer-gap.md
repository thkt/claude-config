---
globs: ["skills/**/SKILL.md", "skills/**/references/*.md", "skills/**/templates/*.md"]
scenes: ["pr-create"]
---

# reference_module を複製した新規ファイルへ SKILL.md がポインタを持たない

## 内容

plan の `reference_module` (kind: module) が指す既存 skill の構造を複製するとき、参照元と同じ役割のファイルを新規作成しただけでは足りない。参照元の SKILL.md がその役割のファイルへ本文中で明示的なポインタ (節見出しやパス言及) を持っているなら、複製先の SKILL.md にも同じ形のポインタが要る。無いと、ファイルは作られていても呼び出し元の本文だけを読む読者やエージェントからは辿れない状態のまま merge される。

## 定型手順

1. `reference_module` (kind: module) が指す既存 skill の SKILL.md を読み、複製する各ファイル (references/、templates/ 配下) について、本文中に明示的なポインタ (節見出し、パスの言及) があるかを確認する
2. 複製先の SKILL.md 本体に、同じ形のポインタが実在するかを `grep` で確認する
3. ポインタが無ければ、SKILL.md へポインタを足す。列や骨格の内容そのものを重複させず、ファイルへの参照だけを書く
4. conformance レビューがこの欠落を Missing/partial として検出できるよう、reference_module の記述に「呼び出し元 SKILL.md からの到達可能性」を含める

## 参照コード

- `agents/reviewers/reviewer-conformance.md` の Missing/partial（spec が求める記述が本文に欠けている場合を検出する区分）
- `skills/think/templates/plan.md` の Reference module（files/conventions は複製するファイル一覧を持つが、呼び出し元 SKILL.md からの到達性は検査しない）

## 根拠

- #577 plan が reference_module に指定した既存 skill の構造を複製する際、新規追加した script や report section が SKILL.md に未記載のまま merge まで残った
- #582 census が SKILL.md 内で `references/decision-criteria.md` と `templates/report-template.md` へ明示的なポインタを持つのに対し、ablate の SKILL.md (本差分では未変更) は新規作成した `references/measurement-criteria.md` と `templates/report-template.md` のどちらにも一度も言及せず、独立した conformance レビューが Missing/partial として検出した
