---
paths:
  - ".claude/skills/**"
  - "skills/**"
  - ".ja/skills/**"
---

# Skill Conventions

`skills/` 配下のスキルファイルに対する規約。

## 命名

スキル名は、そのスキルが行う操作を表す語にする。helper, utils, tools のような汎用名は操作名へ置き換える。

| user-invocable | バインド   | パターン              | 例                                            |
| -------------- | ---------- | --------------------- | --------------------------------------------- |
| true           | -          | 短縮名                | commit, fix, audit                            |
| false          | CLI ラップ | `use-cli-<cli>`       | use-cli-recall, use-cli-scout                 |
| false          | Agent 専用 | `use-context-<agent>` | use-context-reviewer-security                 |
| false          | Workflow   | `use-workflow-<noun>` | use-workflow-tdd-cycle, use-workflow-pageshot |

## H1

読み手が開いた skill を、人が打つものかモデルだけが辿る wrapper かで見分けられるようにする。

| user-invocable | H1                     | 例                                |
| -------------- | ---------------------- | --------------------------------- |
| true (既定)    | `/<name>` で始める     | `# /issue - GitHub Issue Generation` |
| false          | skill 名そのもの       | `# use-cli-scout`                 |

## ディレクトリ構造

すべてのスキルは `skills/` 直下に置き、共有フラグメントは `_lib/` 直下に置く。

```text
skills/
├── _lib/
└── skill-name/
    ├── SKILL.md (required)
    └── references/ (optional)
        └── detailed-guide.md
```

## YAML Frontmatter

| フィールド               | 備考                                               |
| ------------------------ | -------------------------------------------------- |
| name                     | 必須。小文字 + ハイフン、64 文字以内               |
| description              | 必須。三人称、1024 文字以内                        |
| when_to_use              | 英語/日本語のトリガー句                            |
| allowed-tools            | 空白区切り                                         |
| agent                    | `agents/` のエージェントにリンク                   |
| context                  | fork = sub-agent、inline = main                    |
| user-invocable           | デフォルト true。false は `/` メニューから隠す     |
| disable-model-invocation | true でモデルからの起動を止め、`/` 経由だけに絞る  |
| model                    | 実行モデルの上書き。未指定は呼び出し元モデルを継承 |
| argument-hint            | `/` メニューに表示する引数ヒント                   |

## 参照記法

`SKILL.md`、`scripts/`、`templates/`、`references/` 内の参照パスは、`${CLAUDE_SKILL_DIR}` 置換のみで書く。

| 形式                                          | 用途         | 理由                                                                                                                          |
| --------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `${CLAUDE_SKILL_DIR}/references/foo.md`       | 常用         | ハーネスが変数を絶対パスに展開する。Read ツールが直接解決                                                                     |
| `${CLAUDE_SKILL_DIR}/../../rules/<path>`      | ルール参照   | ハーネスが展開し、plugin インストール先の中で解決する。skill と同じ版の rules を読む                                          |
| `~/.claude/rules/<path>`                      | 不可         | 開発ツリーを指す。plugin インストールでは別の複製を読むか、何も読めない。`~/.claude/settings.json` は実行側の参照なので対象外 |
| `${CLAUDE_SKILL_DIR}/../<dir>/foo.md`         | クロススキル | ハーネスが展開し、Read が `..` を正規化する。skills 横断の `_lib/` 共有に使う                                                 |
| `[references/foo.md](references/foo.md)`      | 不可         | ハーネスは markdown リンクを展開しない。AI が相対パスを推論する必要がある                                                     |
| `` `${CLAUDE_SKILL_DIR}/references/foo.md` `` | 避ける       | バッククォート内のハーネス挙動は未文書。安全のため省く                                                                        |

## 引数変数

Skill 入力引数は起動時に展開される。

| 変数            | 戻り値                     | 例 (args=`alpha beta gamma`)    |
| --------------- | -------------------------- | ------------------------------- |
| `$ARGUMENTS`    | 全引数文字列               | `alpha beta gamma`              |
| `$ARGUMENTS[N]` | `split(' ')[N]` (0 始まり) | `[0]` = `alpha`, `[1]` = `beta` |
| `$N`            | `$ARGUMENTS[N]` の短縮形   | `$0` = `alpha`, `$1` = `beta`   |

## サイズ制限

- SKILL.md 本文、リファレンスファイル共に上限は 100 行
- 超えたら SKILL.md 本文はリファレンスファイルに、リファレンスファイルはトピックで分割する

## 品質軸

スキルは機械的なルールをすべて満たしても、読みにくくなることがある。

| 軸                         | 合格条件                                                   | 不合格サイン                                               |
| -------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| 単一責務                   | 1 スキル 1 タスク。無関係な 2 つ目のトリガーは分割サイン   | description が無関係な機能を 2 つ以上連結                  |
| description の識別性       | 1 文目が具体的な動詞と対象で機能を列挙する                 | helps with や manages など多くのスキルに当てはまる汎用動詞 |
| 命令形                     | 本文が agent に直接命令する                                | スキルが何をするかの受動的説明                             |
| Phase 間の受け渡し         | 値を後の Phase へ渡す記述は、受け取る側の節にも出所を書く  | 渡す側だけが Phase N で使うと書き、着地点が無い            |
| 検証可能な完了             | step が検証可能な条件と明示的な完了状態で終わる            | 完了状態が無い、または検証条件のない確認指示止まり         |
| 具体的なキャリブレーション | 判断ごとに Good/Bad ペア、Yes/Not 対比、数値閾値のいずれか | ルールが抽象的で例が無い                                   |
| 段階的開示                 | SKILL.md は薄く保ち、詳細は `references/` に置く           | `references/` に置くべき内容の詰め込み                     |
