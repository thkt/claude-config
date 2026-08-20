---
name: slice
description: 計画 / spec / PRD を独立して着手可能な tracer-bullet 垂直スライス issue 群に分解し、依存順で GitHub に公開する。各 issue は全レイヤーを貫く 1 本の細い縦串。1 件の要求を起票するだけなら使わない (代わりに /issue)。
when_to_use: 計画を issue に分解, plan を issue 化, spec を issue 群に, vertical slice, tracer bullet, issue 分割, slice
allowed-tools: Bash(gh:*) Bash(ugrep:*) Bash(bfs:*) Read LS Agent AskUserQuestion
model: opus
argument-hint: "[plan / spec / PRD / issue ref]"
---

# /slice - 計画を垂直スライス issue に分解

計画を独立して着手可能な issue へ分解する。各 issue は tracer bullet で、schema、API、UI、test の全レイヤーを端から端まで貫く 1 本の細い縦串になり、それ単体で demo または検証できる。

## 入力

`$ARGUMENTS` から計画のソースを取る。番号、URL、パスのいずれかで issue を参照していれば `gh issue view <N>` で本文とコメントを取得する。空ならまず会話文脈にある計画を使い、無ければ何を分解するか AskUserQuestion で問う。

## publish した issue の引き渡し先

slice が生む issue には `## Plan` がまだ無く、そのまま `/build` に渡すと no-plan で止まる。各スライスは `/think` で plan を作り issue の `## Plan` 節へ書き足してから `/build` に渡す。既に構造化 plan を手元に持つなら `/code` を使う。

## Phase 1: コードベース探索 (任意)

未探索なら現状を把握する。issue のタイトルと説明はプロジェクトの用語集に従い、触る領域の DR を尊重する。実装を楽にする prefactor の機会を探す。横断的な探索が要るときだけ Explore エージェントを 1 体起動する。per-slice の spawn はしない。

## Phase 2: 垂直スライスを起草する

計画を tracer bullet issue に割る。横スライス (1 レイヤーだけ) ではなく縦スライス。各スライスの説明は、レイヤーごとの実装手順でなく端から端までの振る舞いで書く。具体的なファイルパスやコードスニペットは陳腐化が速く、着手時に読む人を誤らせるので書かない。例外は prototype が生んだ state machine、reducer、schema、型のスニペットで、散文より正確に決定を符号化する場合のみ。その場合は prototype 由来と一言添え、決定に効く部分だけに刈り込む。受け入れ基準は、そのスライス単体で demo または検証できる形にする。他スライスの完了を前提にした基準は、依存として Blocked by へ移す。

| ルール       | 内容                                                  |
| ------------ | ----------------------------------------------------- |
| 全レイヤー   | 各スライスは schema、API、UI、test の全レイヤーを貫く |
| 単独検証可能 | 完了スライスはそれ単体で demo または検証できる        |
| prefactor 先 | prefactor が要るなら最初のスライスに置く              |

### 被覆チェック

起草後、user story、acceptance criteria、FR に相当する要求単位を列挙し、どのスライスにも割り当てられていない単位を抽出する。取りこぼしを偽検出より重く扱い、疑わしい単位は未カバーに含める。未カバーは Phase 3 の提示に明示する。

## Phase 3: ユーザーに確認する

提案分解を番号付きリストで提示し、末尾に未カバーを 1 行足す。未カバーが無ければ「なし」と書く。提示後に次を問う。粒度は粗すぎず細かすぎないか。依存関係は正しいか。merge か split すべきスライスはあるか。未カバー単位をどう扱うか。扱いの選択肢は、既存スライスへの割り当て、新スライス、理由付きの意図的除外。ユーザーが承認するまで反復する。各スライスに示す項目は下表のとおり。

| 項目         | 内容                                     |
| ------------ | ---------------------------------------- |
| Title        | 短い説明的な名前                         |
| Blocked by   | 先に完了すべき他スライス (あれば)        |
| User stories | このスライスが満たす user story (あれば) |

## Phase 4: issue を publish する

承認後、batch publish の前に AskUserQuestion で「これら N 件の issue を作成するか」と最終確認する。N 件作成は外向きで巻き戻しにくいため、確認なしの自動 publish はしない。

承認したら、blocker を先にする依存順で publish する。"Blocked by" に実 issue 番号を書けるよう、blocker を先に作ってその番号を捕捉する。

1. テンプレート選択で決めた骨格に本文を流し込み、一時ファイルへ書き出す。`<path>` は変数でなくリテラルの絶対パスで書く。hook は変数を展開できず、起票が止まる
2. `gh issue create --title "<title>" --body-file <path>` で起票する。複数行の markdown は `--body` では壊れるので `--body-file` を使う
3. triage label は付けない。AFK consumer 連携は対象外。親 issue は close せず、内容も変更しない
4. 作成した issue を依存順に列挙し、各行に issue 番号と blocker の番号を書く。blocker が無ければ「なし」と書く

### テンプレート選択

`gh api "repos/{owner}/{repo}/contents/.github/ISSUE_TEMPLATE" --jq '.[].name'` で `.md` を列挙する。feature 相当のテンプレートがあればそれを、無くてテンプレートが 1 つだけならそれを骨格にし、本文を読んで先頭 frontmatter の `name`、`about`、`labels`、`title` を外す。候補が無ければ ${CLAUDE_SKILL_DIR}/../issue/templates/feature.md を使う。

どちらの骨格を選んでも `## Parent` を先頭に、`## Blocked by` を末尾に足す。当てはまらない任意節は落とす。確信度マーキングは適用しない。Phase 3 で粒度と依存をユーザーが承認済みなので、publish するスライスに未決の判断は残らない。

## 言語

`~/.claude/settings.json` から `language` を読み、issue 本文をその言語に翻訳する。未設定なら英語。技術用語、コード、識別子は翻訳しない。

## エラー処理

| エラー               | アクション                                 |
| -------------------- | ------------------------------------------ |
| issue 参照が解決不可 | ref を報告して停止                         |
| git リポジトリでない | git リポジトリでない旨を報告               |
| gh の認証に失敗      | 認証エラーを報告                           |
| publish 途中で失敗   | 作成済み番号を報告し、残りの再開可否を問う |
