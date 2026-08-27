# candidates

ページ化前の候補置き場。1 行は「内容 1 行 + 根拠」で、根拠は PR/issue 由来なら #番号、`.claude/workspace/research/` 由来なら (research) と書く。research のファイルパスは書かない。

「単発」は根拠が 1 件の項目で、2 件目が現れたらページへ昇格して行を消す。「昇格待ち」は根拠が 2 件以上ありながら、1 回あたりのページ上限を超えて持ち越した項目。次の run では根拠の多い順にここから先へ進む。

## 昇格待ち

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
- ツールの許可は settings.json、skill frontmatter、agent frontmatter の 3 面にあり、1 面だけ足しても届かない (research)
- 追跡外ファイルを追跡下へ移すとき、未マージのまま別ブランチへ checkout すると実体が消える #521
- scribe.yml の checkout が persist-credentials: true を直接設定し、push 専用 step に絞る規約と異なる #537
- claude-code-action の OIDC 認証には permissions.id-token: write が要る #540
- Python の共有コードは同ディレクトリ sibling import・tree 配下の _lib + sys.path.insert・skills/_lib の CLI 分離の 3 階層で置き場が決まる (research)
- agentType の bare name 解決は plugin-only install で失敗し、workflow() の sibling 相当のフォールバックが無い (research)
- build.js の Ship stage は plan スコープ外の tracked file 変更も無条件で commit に含める (research)

## 棄却

- audit report 命名は `<YYYY-MM-DD>-<HHMMSS>-<slug>.md`、slug は skill 名一致 #47 #51 #52 #53
  根拠 #53 が揃えた対象の audit-adr-gaps skill は現存せず、レポート命名を持つのは adrift 1 本のみ。その slug は dr-drift で skill 名と一致しない

- linter の false positive は緩和でなく理由コメント付き disable で抑止する #167 #168 #171 #176 #390
  根拠の #390 #167 #176 はいずれも linter の false positive への対処を述べておらず、規約の内容を確定できない

- hook payload の形状は smoke test で実測確定し fixture 化してから gate を作る #150 #154
  根拠の実体は hooks/veto/veto.py 一式 (issue-gate) だが、issue→build フローの人間駆動化決定 (2026-07-13 research) により veto 機構は全廃され現在は存在しない。同じ手順を体現する現行コードも見当たらず、参照コード無しでは共通項として維持できない
