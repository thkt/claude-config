# Template source

Settle where the skeleton of a filed issue comes from. Both `/issue` and `/slice` choose in this order. When one of them chooses differently, the same repository ends up with two shapes of body.

Look under `<git-root>/.github/ISSUE_TEMPLATE/` for the skeleton matching the type. Work down the table and take the first file that exists. `hooks/pre-bash/issue_body_gate.py` runs the same lookup in the same order at filing time, so hand the file chosen here to `validate-issue-body.py` as it is. The repository's own comes first so that a web-UI filing and a CLI filing carry the same skeleton.

The top two state the minimum the web UI asks someone to fill in. Adding sections at CLI filing time is not a deviation. A feature carries `Acceptance Criteria` and `Testing Decisions` even when the skeleton omits them. A bug carries `Steps to Reproduce` and `Expected vs Actual`. Those two live in `validate-issue-body.py`'s `FLOOR` per type, which adds them whatever the skeleton requires.

| Skeleton                          | How the section names are read                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| The repository's `<type>.yml`     | Take each `body` entry's `attributes.label` as a section name. Only an entry whose `validations.required` is true is required |
| The repository's `<type>.md`      | The body with `name` / `about` / `labels` / `title` removed from the leading frontmatter                                      |
| The skill's `templates/<type>.md` | The code fence under `## Template`                                                                                            |
