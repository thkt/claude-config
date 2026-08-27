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
- severity ランクの引き算は NaN フォールスルーで || チェーンを素通りする #548
- sort の fixture は補助属性の順がソートキーと偶然一致するとフォールスルー欠陥を検出し損ねる #548
- issue の Alternatives が却下した粒度に実装が逆戻りし、独立した適合性レビューで検出される #547
- スキル共有 (DRY) 判断は消費者数でなく content-fit で検証する (research)
- hook の永続化は Stop で専用ファイルへ、注入は SessionStart で additionalContext へ分離し prompt cache を守る (research)
- HTML から採取した workflow YAML は text@text 形式が Cloudflare のメール難読化で壊れる (research)
- 壊れた workflow YAML は GitHub API 上 name が file path へ fallback する (research)
- API 削除 PR はコード呼び出し元だけでなく ADR/docstring の名指し参照も棚卸しする (research)
- UI 確認はスクショだけでなく確認観点を先に列挙してから検証する (research)
- 見た目修正 issue は画像だけでなく色・サイズ等をテキストで明記する (research)
- 不具合調査は最初の見え方でなく操作後の状態遷移で切り分けてから修正に入る (research)
- 危険度の高い変更はレビュー観点を明文化し品質ゲート化する (research)
- 外部システム挙動の claim は一次ソース検証必須で、未検証なら disconfirmation の根拠に使えない (research)
- bug の root cause 特定後は同一生成工程の兄弟 artifact を洗い出し同種欠陥を検証する (research)
- 自作 CLI は --help 使用例・JSON 出力・--dry-run が揃って欠ける (research)
- skill に tool を書いて許可するだけでは使われず、既存手段を明示的に禁止する enforcement 文が要る (research)
- PR 本文に scope 外のファイル変更を列挙しレビューの焦点を宣言スコープ側に示す #554
- issue 本文の未確認 premise は tentative と明記する #377
- 実需が未証明の提案は premise 未確認のまま実装せず、再着手条件を残して close する #377
- 供給の一覧は実行側の定数で持ち、docstring やインライン辞書リテラルへ分散すると契約が陳腐化する #557
- seam の受け入れテストが新関数を直接呼ぶだけでは足りず、production の実呼び出し口 (CLI main() 等) も同じ経路を通ることを確認する #558
- 契約に返り値フィールドを追加するときは、早期 return (stopped) 分岐も含めた全 exit path でそのフィールドを持たせる #562
- marketplace action が GitHub から削除されるとそれを参照する workflow は評価不能になり trigger のたびに startup failure が積まれる。gh api で参照先の実在を確認し、無ければ同等処理を gh CLI ベースの inline script へ置き換えて外部依存を切る #565

## 棄却

- audit report 命名は `<YYYY-MM-DD>-<HHMMSS>-<slug>.md`、slug は skill 名一致 #47 #51 #52 #53
  根拠 #53 が揃えた対象の audit-adr-gaps skill は現存せず、レポート命名を持つのは adrift 1 本のみ。その slug は dr-drift で skill 名と一致しない

- linter の false positive は緩和でなく理由コメント付き disable で抑止する #167 #168 #171 #176 #390
  根拠の #390 #167 #176 はいずれも linter の false positive への対処を述べておらず、規約の内容を確定できない

- hook payload の形状は smoke test で実測確定し fixture 化してから gate を作る #150 #154
  根拠の実体は hooks/veto/veto.py 一式 (issue-gate) だが、issue→build フローの人間駆動化決定 (2026-07-13 research) により veto 機構は全廃され現在は存在しない。同じ手順を体現する現行コードも見当たらず、参照コード無しでは共通項として維持できない
