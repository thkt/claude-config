# MADR テンプレート

テンプレートは全決定タイプで共通。タイプで変わるのは More Information 配下の推奨トピックだけで、決定タイプで選んだものを `### {topic}` として並べる。

## テンプレート

`{...}` は作成時に置き換える。任意と記したセクションは、書く内容がなければ見出しごと省略する。

```markdown
---
status: "{proposed | rejected | accepted | deprecated | superseded by DR-NNNN}"
date: "{YYYY-MM-DD}"
decision-makers: "{名前または役割}"
consulted: "{任意。相談した専門家}"
informed: "{任意。結果を共有する利害関係者}"
---

# {Adopt X for Y 形式の決定タイトル}

## Context and Problem Statement

{なぜこの決定が必要か。問いの形で締めてよい}

## Decision Drivers

- {任意。選択を導いた基準を箇条書きで}

## Considered Options

- {option 1}
- {option 2。2 つ以上列挙する}

## Decision Outcome

Chosen option: "{選択した option}", because {選んだ理由}.

### Consequences

- Good, because {良い帰結}
- Bad, because {悪い帰結}

### Confirmation

{実装が決定と一致しているかの検証方法。CI コマンドやレビュー手順など}

## Pros and Cons of the Options

{任意。option ごとに以下を繰り返す}

### {option}

{1 行の説明}

- Good, because {利点}
- Bad, because {欠点}

## More Information

### {タイプ別推奨トピック}

{決定タイプの推奨トピックのうち決定に該当するもののみ。トピックごとに ### 見出しを繰り返す}

### Reassessment Triggers

- {決定を再評価する条件}
```
