# OUTCOME テンプレート

`.claude/OUTCOME.md` の stub テンプレート。`/outcome` スキルが生成と更新のときに読む。

## テンプレート

各リポジトリの `.claude/OUTCOME.md` は以下の構造に従う。`{...}` は生成時に内容へ置き換える。Behavior は必須。Indicators は任意で、Behavior を裏付ける場合のみ書き、なければセクションごと省略する。決めきれない項目は TBD と書き、全項が TBD のファイルは下流がアウトカム不在として扱う。

```markdown
# OUTCOME

## Outcome state

{任意の冒頭文。プロジェクトの存在意義と、向かう方向。理想表現を許容}

### Behavior

{完了状態における主体 (人間ユーザー / AI エージェント / システム) の状態。実装非依存。観察可能。異なる振る舞いごとに 1 行}

### Indicators

{任意。上の Behavior を裏付ける状態。数値、時間、または理想方向。Behavior を明確にする Indicator がなければセクションごと省略}

| Indicator  | 値                       | 裏付ける Behavior    |
| ---------- | ------------------------ | -------------------- |
| Time       | {境界値}                 | {どの Behavior 行か} |
| Error rate | {境界値}                 | {どの Behavior 行か} |
| Value      | {受益者が価値を持つ状態} | {どの Behavior 行か} |

## Non-goals

{箇条書き。明示的にスコープ外とするもの}

## Constraints

{箇条書き。動かせない技術、法的、組織的制約}
```
