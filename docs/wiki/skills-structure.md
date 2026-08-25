---
globs: ["**/skills/**/*"]
kind: structure
---

# skill の構造と呼び出し契約

## 内容

skill は `skills/<name>/SKILL.md` を本体とし、Skill tool が読み込む。27 の skill が SKILL.md を持ち、`skills/_lib/` だけが本体を持たない共有ライブラリになる。

## 境界

- skill は Skill tool で起動し、workflow は Workflow tool で起動する。両者は別の機構で、skill から workflow を呼ぶ経路は無い
- `user-invocable: false` の skill は `/名前` で呼べない。他の skill か agent が参照する側になる。11 件がこれに当たる
- `skills/_lib/` は SKILL.md を持たず、skill として起動しない。`review_score.py` と `review-harness.md` を読むのは reviewer skill の測定手順で、`rules/development/TESTING.md` と `skills/use-context-reviewer-security/test/README.md` がその経路を書く
- skill の scripts は他の skill から `${CLAUDE_SKILL_DIR}/../<skill>/scripts/<file>` で呼べる。実在する経路は 3 本で、`issue/validate-issue-body.py`、`research/find-prior-research.py`、`scribe/find_wiki_rule.py` が呼ばれる側になる

## 契約

| 対象 | 契約 |
| --- | --- |
| frontmatter の必須 | `name`、`description`、`allowed-tools` の 3 つを 27 件すべてが持つ。`model` は 15 件、`argument-hint` は 13 件、`user-invocable` は 11 件、`context` は 7 件、`agent` は 4 件 |
| `${CLAUDE_SKILL_DIR}` | skill 自身のディレクトリを指す。`../` で 1 つ上がると `skills/` に届き、他の skill の scripts へ辿れる |
| `allowed-tools` と呼び出し形 | SKILL.md が書くコマンドと `allowed-tools` の許可が一致しないと拒否される。`Bash(python3:*)` を持たない skill は `python3` で script を呼べない |
| テストの置き場 | `skills/<name>/tests/*_test.py`。CI は `find agents hooks skills workflows -name '*_test.py'` で拾うので、`docs/` 配下に置くと走らない |
| テストの ROOT 解決 | `HERE.parents[2]` がリポジトリ root になる。`skills/<name>/tests/` から 3 つ上がった位置 |

## 要求

| 対象 | 要求 | 満たさないときの挙動 |
| --- | --- | --- |
| テストの言語側 | 英語側にのみ置く。`.ja/skills/` 配下のテストは 0 件 | `.ja/` に置いたテストは走らない。CI の find が `skills` を起点にする |
| script の呼び出し | `allowed-tools` に対応する `Bash(...)` を書く | 実行時に拒否される |

## 参照コード

- `skills/_lib/review_score.py`（reviewer skill の Recall と FP Rate を出す。skill 本体を持たない共有ライブラリ側にある）
- `skills/scribe/scripts/find_wiki_rule.py`（他 skill から `${CLAUDE_SKILL_DIR}/../scribe/scripts/` で呼ばれる側）
- `.github/workflows/test.yml` の `Python tests`（テストを拾う find の範囲）

## 由来

- `docs/decisions/0055-consolidate-user-invocable-false-skills-under-use-prefix.md`（`user-invocable: false` の skill を `use-` 接頭辞へ統一した DR）
- `docs/decisions/0042-colocate-skill-specific-scripts-within-skill.md`（skill 固有の script を skill 配下へ置く DR）
