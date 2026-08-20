# テンプレート選択

起票する issue の骨格をどこから取るかを決める。`/issue` と `/slice` の両方がこの順で選ぶ。片方だけが別の順で選ぶと、同じリポジトリに 2 通りの本文が並ぶ。

`gh api "repos/{owner}/{repo}/contents/.github/ISSUE_TEMPLATE" --jq '.[].name'` でテンプレートを列挙する。種別に対応する骨格を下表の上から順に探し、最初に見つかったものを採用する。リポジトリ内のテンプレートを優先するのは、Web UI と CLI から起票される issue の骨格を揃えるため。

| 骨格                           | 節名の取り方                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| リポジトリの `<type>.yml`      | 各 `body` 要素の `attributes.label` を節名とする。`validations.required` が真の要素だけを必須とする |
| リポジトリの `<type>.md`       | 先頭の frontmatter から `name`/`about`/`labels`/`title` を除いた本文                                |
| skill の `templates/<type>.md` | `## Template` 直下のコードフェンス                                                                  |

上の 2 種類は、Web UI で入力を求める最小要件を定める。CLI からの起票時に追加の節を設けても逸脱にはならない。骨格に含まれていない場合でも、feature には `Acceptance Criteria` と `Testing Decisions` を書く。bug には `Steps to Reproduce` と `Expected vs Actual` を書く。この 2 つは `validate-issue-body.py` の `FLOOR` が種別ごとに持ち、骨格が何を必須としても足す。
