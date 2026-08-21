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

| フィールド                      | 備考                                                                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| name                            | 必須。小文字 + ハイフン。ファイル名と一致不要。同一スコープ内で一意 (重複は片方が警告なく破棄)                                                                             |
| description                     | 必須。いつ委譲すべきかを書く。委譲先の振り分けに使用                                                                                                                       |
| tools, disallowedTools          | カンマまたは空白区切り文字列。省略時は全ツール継承。Bash matcher 構文 (`Bash(git log:*)`) も可                                                                             |
| model                           | sonnet/opus/haiku/fable/inherit/full-id。デフォルトは `inherit`                                                                                                            |
| permissionMode, maxTurns        | 必要に応じて                                                                                                                                                               |
| skills                          | 起動時にスキル内容を注入。plugin form は `<plugin>:<skill>`                                                                                                                |
| mcpServers, hooks               | 必要に応じて                                                                                                                                                               |
| memory                          | `user`/`project`/`local`。有効化で Read/Write/Edit を自動付与                                                                                                              |
| background                      | Boolean。対話セッションでの起動は `false` を書いてもバックグラウンドで走る。workflow と headless はこの既定の外                                                            |
| effort                          | low/medium/high/xhigh/max                                                                                                                                                  |
| isolation, color, initialPrompt | 必要に応じて                                                                                                                                                               |
| observer                        | このエージェントが走るたび background で起動する observer の agent 型名。observer は読み取り専用の活動ダイジェストを受け取り ObserverReport で報告し、タスクには参加しない |
| observerMessage                 | 各ダイジェストへ追記する補足文。空値は無視される                                                                                                                           |
| observeSubagents                | Boolean。observer の監視を入れ子のサブエージェントへ広げる                                                                                                                 |

## fork の判定

`subagent_type` は 1 つの値しか取らない。`"fork"` と `agents/` の型名は排他で、fork を選ぶとエージェント定義は読み込まれない。fork は自分自身の複製であって、別のエージェントではない。critic- と reviewer- は親の結論を攻撃する役なので、fork すると役が成立しなくなる。

| 起動                                 | fork | 理由                                                                                                           |
| ------------------------------------ | ---- | -------------------------------------------------------------------------------------------------------------- |
| `agents/` の型を名指しする           | 不適 | model 指定、tools 制限、独立性、戻り値の形が同時に消える                                                       |
| 型を省略する、または組み込み型を渡す | 可   | 親の会話が仕事の対象そのものなら、文脈をプロンプトへ書き写す手間が消える。入力トークンは会話の大きさだけ増える |

## model と memory の選び方

memory は次の 3 つをすべて満たすとき付与し、project スコープに実データが貯まらないまま残る場合は外す。

- セッション横断で繰り返し起動される (監査のたびに呼ばれる)
- 出力品質がプロジェクト固有の知識に依存する (命名規約、許可パターン)
- 偽陽性を減らすか一貫性を改善する (既知例外を再報告しなくなる)

| model の必要条件                                      | 推奨         |
| ----------------------------------------------------- | ------------ |
| 多段命令、エージェント間 DM、シャットダウンプロトコル | opus, sonnet |
| 機械的な単一パス出力                                  | haiku        |
| 親コンテキストに合わせる                              | inherit      |

## 本文構造

| セクション           | 用途                                   |
| -------------------- | -------------------------------------- |
| Input                | エージェントが期待するタスクプロンプト |
| Constraints/PROHIBIT | エージェントが行ってはならないこと     |
| Workflow/Phases      | ステップごとのアクション               |
| Output               | DM ペイロードまたはファイル成果物      |
| Error Handling       | 復旧の振る舞い                         |

## 指摘の重要度

reviewer- 系は `~/.claude/agents/_lib/finding-schema.md` の Severity (critical/high/medium/low) に従う。何を先に直すかは同ファイルの Disposition が持ち、値の一覧はそこにある。独自のゲート判定を返すエージェント (critic- 系の confirmed/disputed など) は自分の方式に従う。

## 参照記法

相対パスの解決先は起動プロジェクトに依存する。

| 形式                                         | 用途                   | 理由                                                     |
| -------------------------------------------- | ---------------------- | -------------------------------------------------------- |
| `skills: [skill-name]` frontmatter           | スキル内容の再利用     | preload 制御として起動時に全文がコンテキストへ注入される |
| `~/.claude/skills/<skill>/references/foo.md` | 補足資料の遅延読み込み | cwd に依存せず Read で解決できる                         |
| `skills/<skill>/references/foo.md`           | 避ける                 | cwd が `~/.claude` のときしか解決できない                |
| `${CLAUDE_SKILL_DIR}`                        | 不可                   | スキル本文専用の変数                                     |

## サイズ制限

- エージェント本体、`_lib/` の共有フラグメント共に上限は 100 行
- 超えたらエージェント本体は `_lib/` へ、`_lib/` はトピックで分割する
