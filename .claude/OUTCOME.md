# OUTCOME

## Outcome state

AI 開発ハーネスの品質保証を LLM の裁量から決定論的な層へ移し、人間の検証コストを判断が必要な残余だけに絞る。

### Behavior

- AI agent は、harness が定めた品質ゲート (hook / workflow / reviewer) を裁量で迂回できない状態で開発作業を行う
- 人間 (thkt) は、AI 成果物の検証を hook と workflow の決定論的な層に委ね、自身は判断が必要な残余のみをレビューする

## Non-goals

- チーム他メンバーへの配布や汎用 plugin marketplace 公開を第一目的にしない。個人 harness 最適化が主
- Claude Code 本体機能の再実装はしない

## Constraints

- Claude Code の hook / skill / plugin 仕様の範囲内で構成する。fork や patch はしない
- .ja/ が canonical、英語側は同一コミットでミラー (ADR-0073)
