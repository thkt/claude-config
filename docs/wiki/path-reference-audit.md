---
globs: ["**/skills/**/*.md", "**/agents/**/*.md", "**/rules/**/*.md"]
scenes: []
---

# パス参照の棚卸し

## 内容

skill/agent/workflow/rule に書かれたパス参照は 3 形式あり、指す先が異なる。棚卸しでは形式ごとに展開規則を変え、実在チェックだけで壊れと判定しない。対象プロジェクト側を指す参照と glob パターンが偽陽性になる。

| 形式                        | 指す先                 | 展開                                                                                         |
| --------------------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| `~/.claude/...`             | dotclaude 内のリソース | そのまま。cwd 非依存                                                                         |
| `${CLAUDE_SKILL_DIR}/...`   | skill 自身の配下       | skill ディレクトリ起点。`../../` は `~/.claude/` に届く                                      |
| `${CLAUDE_PLUGIN_ROOT}/...` | agent が読む同梱資産   | plugin install 起点。dev tree では未展開のまま残り、agent 本文の代替文が `~/.claude/` へ送る |
| 相対パス                    | 起動プロジェクト内     | 起動時の cwd 起点                                                                            |

## 定型手順

1. `git ls-files` で skills/agents/workflows/rules/output-styles/CLAUDE.md と `.ja/` 対応を対象にする
2. 3 形式を正規表現で抽出し、末尾の句読点とバッククォートを落とす
3. `.ja/` 配下のファイルは prefix を除いたパスを起点に展開する。`.ja/` は canonical であって実行体ではない
4. glob (`*` を含む) は展開せず目視に回す
5. 実在しないものを次の型で仕分ける。いずれにも当たらないものだけが壊れた参照

| 偽陽性の型               | 例                                                          |
| ------------------------ | ----------------------------------------------------------- |
| 対象プロジェクト側のパス | `docs/pull_request_template.md` の探索順序                  |
| ファイルパターンの表記   | `agents/*.md`, `skills/SKILL.md`                            |
| 実行時に作られる出力先   | `${CLAUDE_SKILL_DIR}/../../workspace/pageshot/`             |
| 規約内の記法説明         | `rules/conventions/SKILLS.md` の `${CLAUDE_SKILL_DIR}` 例示 |

## 根拠

- #239 audit skill の attic 退避後、reviewer 18 件が `finding-schema.md` を裸のファイル名で参照し続け、どこからも解決できなかった
- #243 全 323 参照を棚卸しし、解決不能ゼロを確認した。MISSING 判定 4 件はすべて上表の偽陽性
- 現行コード: `rules/conventions/SUBAGENT.md` § Reference notation、`rules/conventions/SKILLS.md` § Reference notation
- 未検証: plugin 経由起動での解決可否。plugin cache が古い版のままだと現状を測れない
