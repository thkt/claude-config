# Template source

Settle where the skeleton of a filed issue comes from. Both `/issue` and `/slice` choose in this order. When one of them chooses differently, the same repository ends up with two shapes of body.

Enumerate the templates via `gh api "repos/{owner}/{repo}/contents/.github/ISSUE_TEMPLATE" --jq '.[].name'`. Look for the skeleton matching the type by working down the table and take the first that answers. The repository's own comes first so that a web-UI filing and a CLI filing carry the same skeleton.

| Skeleton                          | How the section names are read                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| The repository's `<type>.yml`     | Take each `body` entry's `attributes.label` as a section name. Only an entry whose `validations.required` is true is required |
| The repository's `<type>.md`      | The body with `name` / `about` / `labels` / `title` removed from the leading frontmatter                                      |
| The skill's `templates/<type>.md` | The code fence under `## Template`                                                                                            |

The top two state the minimum the web UI asks someone to fill in. Adding sections at CLI filing time is not a deviation. A feature carries `Acceptance Criteria` and `Testing Decisions` even when the skeleton omits them. A bug carries `Steps to Reproduce` and `Expected vs Actual`. Those two live in `validate-issue-body.py`'s `FLOOR` per type, which adds them whatever the skeleton requires.
