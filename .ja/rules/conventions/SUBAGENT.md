---
paths:
  - ".claude/agents/**"
  - "agents/**"
  - ".ja/agents/**"
---

# Subagent Conventions

`agents/` 配下のサブエージェントファイルに対する規約。

## 命名

命名パターンは小文字 + ハイフン `<role>-<scope>` のみ。ファイルは role の複数形サブディレクトリに置く。

| Role 接頭辞 | 用途                 | 例                |
| ----------- | -------------------- | ----------------- |
| critic-     | 反論                 | critic-design     |
| enhancer-   | コード改善・結果統合 | enhancer-code     |
| explorer-   | コードベース探索     | explorer-feature  |
| generator-  | アーティファクト生成 | generator-test    |
| resolver-   | エラー修正           | resolver-build    |
| reviewer-   | 検査                 | reviewer-security |

## YAML Frontmatter

エージェントは Agent ツール経由で起動され、自動ロードされない。AskUserQuestion/EnterPlanMode/ScheduleWakeup などはエージェント内で動作せず `tools` に列挙しても無効。Agent ツール自体はエージェント内でも動作し、メインループを深さ 0 として深さ 3 のエージェントまでネスト起動できる。

| フィールド                      | 必須 | 備考                                                                                                            |
| ------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------- |
| name                            | Yes  | 小文字 + ハイフン。ファイル名と一致不要。同一スコープ内で一意 (重複は片方が警告なく破棄)                        |
| description                     | Yes  | いつ委譲すべきかを書く。委譲先の振り分けに使用                                                                  |
| tools, disallowedTools          | No   | カンマまたは空白区切り文字列。省略時は全ツール継承。Bash matcher 構文 (`Bash(git log:*)`) も可                  |
| model                           | No   | sonnet / opus / haiku / fable / inherit / full-id。デフォルトは `inherit`                                       |
| permissionMode, maxTurns        | No   | 必要に応じて                                                                                                    |
| skills                          | No   | 起動時にスキル内容を注入。plugin form は `<plugin>:<skill>`                                                     |
| mcpServers, hooks               | No   | 必要に応じて                                                                                                    |
| memory                          | No   | `user` / `project` / `local`。有効化で Read / Write / Edit を自動付与                                           |
| background                      | No   | Boolean。対話セッションでの起動は `false` を書いてもバックグラウンドで走る。workflow と headless はこの既定の外 |
| effort                          | No   | low / medium / high / xhigh / max                                                                               |
| isolation, color, initialPrompt | No   | 必要に応じて                                                                                                    |

## fork の判定

`subagent_type` は 1 つの値しか取らない。`"fork"` と `agents/` の型名は排他で、fork を選ぶとエージェント定義は読み込まれない。fork は自分自身の複製であって、別のエージェントではない。critic- と reviewer- は親の結論を攻撃する役なので、fork すると役が成立しなくなる。

判定は起動が `agents/` の型を名指ししているかで決まる。

| 起動                                 | fork | 理由                                                                                                         |
| ------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------ |
| `agents/` の型を名指しする           | 不適 | model 指定、tools 制限、独立性、戻り値の形が同時に消える                                                     |
| 型を省略する、または組み込み型を渡す | 可   | 親の会話が仕事の対象そのものなら、文脈を prompt へ書き写す手間が消える。入力トークンは会話の大きさだけ増える |

## モデル選択基準

| 必要条件                                              | 推奨         |
| ----------------------------------------------------- | ------------ |
| 多段命令、エージェント間 DM、シャットダウンプロトコル | opus, sonnet |
| 機械的な単一パス出力                                  | haiku        |
| 親コンテキストに合わせる                              | inherit      |

## Memory 選択基準

memory を付与する必須条件は以下のとおり。付与後、project スコープに実データが貯まらないまま残る場合は外す。

| 必須条件         | 説明                                       | 例                         |
| ---------------- | ------------------------------------------ | -------------------------- |
| 頻度             | セッション横断で繰り返し起動される         | 監査のたびに呼ばれる       |
| プロジェクト依存 | 出力品質がプロジェクト固有の知識に依存する | 命名規約、許可パターン     |
| 学習効果         | memory が偽陽性を減らすか一貫性を改善する  | 既知例外を再報告しなくなる |

## 本文構造

| セクション             | 用途                                   |
| ---------------------- | -------------------------------------- |
| Input                  | エージェントが期待するタスクプロンプト |
| Constraints / PROHIBIT | エージェントが行ってはならないこと     |
| Workflow / Phases      | ステップごとのアクション               |
| Output                 | DM ペイロードまたはファイル成果物      |
| Error Handling         | 復旧の振る舞い                         |

## 指摘の重要度

reviewer- 系は `~/.claude/agents/_lib/finding-schema.md` の Severity (critical/high/medium/low) に従う。独自のゲート判定を返すエージェント (critic- 系の confirmed/disputed など) は自分の方式に従う。

## 参照記法

相対パスの解決先は起動プロジェクトに依存する。

| 形式                                         | 用途                   | 理由                                                     |
| -------------------------------------------- | ---------------------- | -------------------------------------------------------- |
| `skills: [skill-name]` frontmatter           | スキル内容の再利用     | preload 制御として起動時に全文がコンテキストへ注入される |
| `~/.claude/skills/<skill>/references/foo.md` | 補足資料の遅延読み込み | cwd に依存せず Read で解決できる                         |
| `skills/<skill>/references/foo.md`           | 避ける                 | cwd が `~/.claude` のときしか解決できない                |
| `${CLAUDE_SKILL_DIR}`                        | 不可                   | スキル本文専用の変数                                     |

## サイズ制限

本文は 200 行を閾値とする。
