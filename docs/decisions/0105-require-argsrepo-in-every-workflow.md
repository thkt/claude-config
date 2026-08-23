---
status: "accepted"
date: "2026-08-23"
decision-makers: "thkt"
---

# Require args.repo in every workflow

## Context and Problem Statement

`repo` を渡さずに workflow を起動すると `anchor()` が no-op になり、agent は自身の cwd から対象リポジトリを選ぶ。`workflows/build.js:125-128` がこの危険をコードに書いている。

危険は実測されている。#204 が additional working directories を複数持つセッションで再現した (run `wf_c58a7f5b-711`、`wf_6e119885-71a`、4 run 中 2 回)。revalidate agent が別リポジトリで precondition を検証し、plan-drift の誤検知を出した。

`37fc4a7b` は `build` だけを塞いだ。残る 6 本を検討した記録は無く、同じ形の穴が開いたままになっている。

## Decision Drivers

- 誤った断定は git で戻せない。読み取りだけの workflow でも、別 checkout の findings を自信を持って返す (#325 が同型を実測)
- workflow script の sandbox が供給するのは、注入される 6 つの関数と `budget`、`console`、`setTimeout` に限られる。script 自身は `git rev-parse` を実行できない
- 起動の手軽さは、誤った checkout で走る危険と釣り合わない

## Considered Options

- 7 本すべてで `args.repo` を必須にする
- 変更する 2 本 (`code`、`polish`) だけ必須にする
- `repo` は任意のまま、agent に `git rev-parse --show-toplevel` を報告させて返り値に載せる
- script が自分で repo を解決する

## Decision Outcome

Chosen option: 7 本すべてで `args.repo` を必須にする。読み取りだけの workflow も、別 checkout を対象にすれば誤った断定を返すため。

### Consequences

- Good, because どの workflow も対象リポジトリを引数で受け取らないまま起動しなくなる
- Good, because 7 本の起動契約が揃い、`build` だけが例外という不揃いが消える
- Bad, because bare string の引数だけで起動する形が使えなくなる。`Workflow({name:'audit'})` も止まる
- Bad, because 20 ファイル 168 本のテストが `repo` を渡す形へ変わる

### Confirmation

`node --test "workflows/**/tests/*.test.js"` が緑であること。各 workflow のテストファイルが `args.repo` 未指定で `stopped: "no-repo"` を返す検査を 1 本持つ。

## Pros and Cons of the Options

### 変更する 2 本だけ必須にする

書き込みを伴う `code` と `polish` に絞る。

- Good, because 落ちるテストが 47 本に収まる
- Bad, because `audit`、`assert`、`adrift`、`shake` が別 checkout を対象に findings を返す経路が残る

### agent に toplevel を報告させる

`repo` を任意のまま、実際に作業した場所を返り値へ載せる。

- Good, because 起動の手軽さが残る
- Bad, because 誤りを事後にしか読めない。変更を伴う run では手遅れになる

### script が自分で repo を解決する

- Bad, because sandbox が `exec` を供給しないので、script からは実行できない
- Bad, because agent を 1 体増やして解決させる案は、その agent 自身が同じ cwd 曖昧性の中にいる

## More Information

### Before / After comparison

|                         | Before                                                           | After                          |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------ |
| `build`                 | `no-repo` で停止                                                 | 変わらない                     |
| 他 6 本                 | 未指定を受け、`anchor()` が no-op                                | `no-repo` で停止               |
| bare string の引数      | `polish` / `shake` / `adrift` / `assert` で shorthand として解釈 | 必ず `no-repo` で止まる        |
| JSON オブジェクト文字列 | 解釈する                                                         | 変わらない (`polish.js:25-33`) |

### Transition Plan

規模は patch して suite を走らせて測った (2026-08-23)。grep での計測は 2 度とも外れたので使わない。

| gate   | 落ちるテスト |
| ------ | ------------ |
| audit  | 75           |
| code   | 35           |
| assert | 29           |
| adrift | 17           |
| polish | 12           |
| shake  | 3            |

6 本を同時に patch した実測は 20 ファイルで 168 本。差は重複で、`audit.seam.test.js` を audit と assert の両方が、`args-shorthand.test.js` を 4 本が落とす。

`code` のテスト 37 箇所は `repo: ""` を渡す。空文字は未指定として扱われるので落ちる。

`workflows/_lib/tests/args-shorthand.test.js` は bare string の分岐を埋めるために置かれた。その分岐が必ず停止に至るので削除し、各 workflow のテストファイルが `no-repo` の検査を持つ形へ移す。

先行して 2 件を landed させた。#461 が無いと audit の停止が「0 件で健全」と読まれ、#462 が無いと無条件 anchor が worktree の prompt を対象リポジトリへ固定する。

### Reassessment Triggers

- `repo` を渡す手間が実際の運用で問題になったとき。JSON オブジェクト文字列の形で足りるかを先に測る
- workflow script の sandbox が `exec` 相当を供給するようになったとき。script 自身が repo を解決できれば、引数を必須にする理由が薄れる
- `anchor()` を通さない prompt が増えたとき。pin が届かない段では repo を必須にしても誤った checkout で走る
