# candidates

ページ化前の候補置き場。1 行は「内容 1 行 + 根拠」で、根拠は PR/issue 由来なら #番号、`.claude/workspace/research/` 由来なら (research) と書く。research のファイルパスは書かない。

「単発」は根拠が 1 件の項目で、2 件目が現れたらページへ昇格して行を消す。「昇格待ち」は根拠が 2 件以上ありながら、1 回あたりのページ上限を超えて持ち越した項目。次の run では根拠の多い順にここから先へ進む。

## 昇格待ち

- hook のコマンド判定は語の有無でなく shlex による位置の解析で行う #349 #350 #351
- テンプレート/skeleton は validator が要求するフィールドを載せ、seam テストで固定する #330 #338 #356 #389
- ローカルで通り CI や別の起動元で落ちる差は、環境が供給するものの違いから出る #354 #358 #381
- 条件付き rules の paths が発火しないまま実装が先行し、規約と実態が乖離する #237 #240
- plugin 配布は fix PR 後に marketplace.json の version bump を別 PR で行い、桁は fix=patch/呼び出し契約変更=minor #200 #203 #207
- linter の false positive は緩和でなく理由コメント付き disable で抑止する #167 #168 #171 #176 #390
- 成果物が gitignore 配下 (output-styles/、.claude/workspace/) の作業は PR にせず手動 close する #33 #37 #38 #42
- 根本原因が Claude Code runtime 側のバグは repo 側 wontfix + upstream 起票 + guard 文言で close する #132 #133 #177
- 横展開の要否は ugrep 全ツリー確認で確定してから scope を固定する #49 #50 #53 #57
- reviewer 系の新設・再構築は Recall、FP baseline を計測して close する #24 #28 #43
- 外部発想の issue には source:<origin> ラベルを付ける #30 #31 #32 #33 #39 #40 #41
- 軽量バックログ複数件は 1 PR に束ねて複数 Closes する #44 #45
- script/agent 出力は JSON stdout、error stderr、banner なしの機械可読形式にする #13 #54
- audit report 命名は `<YYYY-MM-DD>-<HHMMSS>-<slug>.md`、slug は skill 名一致 #47 #51 #52 #53
- 翻訳は情報系 prose のみ、file:line、severity、Closes 等の構造化フィールドは verbatim #175 #176
- policy 値 (effort/model) は per-file 定数でなく behavioral capture テストで固定する #191 #192 #199 #223 #224
- hook payload の形状は smoke test で実測確定し fixture 化してから gate を作る #150 #154
- 挙動が実 run で観測できるまで PR は draft に据え置く #143 #159 #162 #163 #226
- 計画/umbrella issue は実装 issue へ切り直して superseded close する #37 #42 #46 #136
- session-start snapshot のため hook/agent 定義変更は同一 session で検証できず次 session 検証を明記する #162 #163 #209
- PostToolUse:Agent は launch 時のみ発火し async 完了で 2 度目が来ない。completion 依存の gate は成立しない #150 #154 #160
- 出力パスの変更前に、予測可能な名前で読む consumer の有無を再確認する #40 #52
- 閾値・tier・スコープは印象でなく実測値を根拠に決める #219 #220 #224 #225
- 前提が harness、upstream の更新で消滅した issue は not planned で close し、消滅した前提を close コメントに残す #136 #184 #210
- 未検証の推測は inferred と明記する。実機検証で棄却されうる (research) #210
- 公開リポの issue body は未信頼入力として BEGIN/END データフェンスで囲んで LLM に渡す #189 #389 #390

## 単発

- anchorless な .gitignore ルール (`plans/` 等) が同名 test fixture dir を任意深さで飲む #169
- user rule の paths frontmatter は originalCwd 相対評価のため直下相対 glob が必要 #59
- plugin source "./" は gitignore を無視して working tree 全体を copy し install cache が肥大する #182
- 共有テンプレリポ (github-labels) から Issue Forms 設定を自動生成する #25
- issue 本文で「再現した事実」と「未確認の仮説」を明示的に切り分ける #48
- workflow script 内で Date.now() が throw するため計測は agent transcript の timestamp から後付け復元する #134
- スタックの分割点は、作業の途中でなくテストが通る境界に置く #389
- 除外やスキップの根拠にした前提は、消えると除外だけが残るのでテストで固定する #389
- 助詞や前置詞に依存した正規表現は、表形式や語順の違う行を取りこぼす #389
- 走らなかった検査と 0 件だった検査は、数でなく status で分けて出す #390
- 集計の分類から外れた値は静かに落ちるので、値の集合を validator で閉じる #389
- 契約の正準が実行側 script にあるとき、参照文書の「この要素は落とす」は必須フィールドの省略として実装され build を止める #468

## 棄却
