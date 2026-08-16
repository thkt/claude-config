# Pages that do not come back, and the way around each

`scout fetch` exits 0 even when the body never arrives. Reach for this file when any of these shows up in the returned Markdown. The body is short. The table separator rows are gone. Headings run into the body text. Line numbers do not line up.

## The output is mangled

The Markdown `fetch` and `research` return breaks code blocks, tables, and lists. It escapes `< > * \ _ ~` even inside code, double-marks `<pre><code>`, and drops table separator rows. `--raw` and `--json` behave the same, and no option suppresses it. The cause sits in `fast_html2md`; the swap to htmd is thkt/scout#370.

| What you want      | The way around                                                                      |
| ------------------ | ----------------------------------------------------------------------------------- |
| A file on GitHub   | `scout repo-read <owner/repo> <path>`                                               |
| A GitHub wiki page | `scout fetch --raw https://raw.githubusercontent.com/wiki/<owner>/<repo>/<Page>.md` |
| A file on GitLab   | `scout fetch https://gitlab.com/<owner>/<repo>/-/raw/<ref>/<path>`                  |

A backtick inside code makes the original string unrecoverable even after stripping the backslashes. `repo-read` does not reach GitLab, so strip backslashes like `=\>` by hand on that route. Drop `--raw` on a wiki page and most of the body disappears, so always pass it. The escaping survives even with it.

## Some sites never return a body

| Site                   | Symptom                                                                                                          | The way around                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| A crates.io crate page | status 404 even with `--js`                                                                                      | `https://docs.rs/crate/<name>/latest`   |
| builder.aws.com        | Inside the sandbox the SSRF proxy never spawns, so it falls to the raw fallback and returns the title line alone | `agent-browser open <URL>`, then `read` |
| A zenn.dev book viewer | The same URL returns the body on some runs and not others                                                        | Re-fetch until the body appears         |

When `agent-browser read` ends at `Loading`, run `read` once more. The cookie consent dialog and the navigation lead the output, so start reading at the first `#` heading. A zenn book prints the same success line on stderr for the runs that lose the body, so only the output's line count separates them. A losing run reads as if the chapter ended there, which is why the loss goes unnoticed. A nonexistent chapter URL exits 66, so adding `2>/dev/null` makes it indistinguishable from a rendering failure.

## Line numbers and headings drift

| Target                       | How it drifts                                                  | What to do                           |
| ---------------------------- | -------------------------------------------------------------- | ------------------------------------ |
| The docs.rs source viewer    | A line-number link for every line precedes the body            | Read the GitHub side via `repo-read` |
| zenn.dev articles and scraps | The heading marker and the heading text land on separate lines | Read the line after the marker       |

`repo-read` embeds line numbers in `cat -n` form, so after a grep read the number inside the line rather than grep's own. The line-number block does not appear on the docs.rs API documentation side (`docs.rs/<name>/latest/...`). The split heading is not how anchored headings behave in general; MDN anchors its headings too and keeps them on one line.

## Outside what scout covers

`repo-*` resolves to the GitHub API's `/repos/<owner>/<repo>`, so it returns `error: Not found` for a GitLab repository and for a GitHub wiki.

scout has no route for x.com and falls through to `fetch`, so read those with `xr`, the read-only X CLI.

| Input                     | Command                   |
| ------------------------- | ------------------------- |
| A Twitter Article         | `xr article <URL>`        |
| A normal post or a thread | `xr tweet <URL> --thread` |

`xr article` exits 2 on a post that carries no article, so branch on the exit code before reading the output. The first element of `xr tweet --thread` is not necessarily the post you asked for; unrelated timeline posts and same-day replies are mixed in. Take the element whose `id` or `url` matches your request as the anchor, collect the elements sharing that anchor's author from the whole output, and do not treat `time` continuity as a condition. `--thread` drops image URLs and the quoted post without any field marking the loss. Re-fetch without `--thread` when `text` ends at a `t.co` link, or when what a demonstrative points at is absent from `text`.

## The shape of the arguments

`repo-tree` does not take a path as a positional argument. `scout repo-tree <owner/repo> plugins/html` fails with `error: unexpected argument`, and it prints no similar-subcommand hint of the kind `repo-list` produces. Narrow with `-p/--path` and `--pattern` instead.
