---
name: pr
description: Analyze branch changes and create a PR. Refine the body via prose review before posting.
when_to_use: PR作って, プルリクエスト, pull request, PR作成
allowed-tools: Bash(git:*) Bash(gh:*) Read AskUserQuestion Skill
model: opus
argument-hint: "[issue reference or context]"
---

# /pr - Pull Request Creator

## Input

`$ARGUMENTS` is an Issue reference or context. Optional; e.g. `#456`. If empty, generate from the current branch only.

## Language

Read `language` from `~/.claude/settings.json` and translate the PR body into that language. If unset, default to English. Keep technical terms, code, and identifiers untranslated.

## Execution

If there are no commits, the directory is not a git repository, or gh auth fails, report the error and abort.

1. Detect the base branch (§ Base Branch Detection)
2. Select the base branch via AskUserQuestion. The options are main, develop, and the detected one. When the detected branch is main or develop, two options collapse into one, so take the detected branch without asking
3. Run the § Analysis Sources commands in parallel
4. Detect UI changes (§ UI Change Detection)
5. Select the template (§ PR Template)
6. Generate the title and body following the selected template (§ Title Rules)
7. Refine the body inline against ${CLAUDE_SKILL_DIR}/references/prose-review.md plus the empty-phrase file matching the body language: `phrases.ja.md` for Japanese, `phrases.en.md` for English
8. Preview the PR, then confirm via AskUserQuestion with `Create this PR?`
9. If UI changes, invoke `use-workflow-pageshot` via Skill with the PR body (§ Pageshot Integration)
10. Push the current branch (§ Push)
11. Write the body to a temp file and create the PR with `gh pr create --title "<title>" --body-file <path>`. A template-derived body contains backticks and `$`, which the shell interprets when passed via `--body`
12. If a pageshot artifact exists, display it (§ Pageshot Integration)

## Analysis Sources

| Category | Source                                 |
| -------- | -------------------------------------- |
| Changes  | `git diff <base>...HEAD`               |
| Commits  | `git log <base>..HEAD`                 |
| Files    | `git diff --name-status <base>...HEAD` |

## Base Branch Detection

```bash
BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
BASE=${BASE:-main}
```

## UI Change Detection

Read the diff from § Analysis Sources to judge visual impact. Logic / type / test / docs-only changes are not UI changes, so skip Pageshot Integration. Pageshot's rendering is the final judge, so when frontend signals are present and the impact is ambiguous, lean toward a UI change. A change affecting visual output through any of the following counts as a UI change.

- markup in JSX / templates / HTML
- CSS / class names / inline styles
- design tokens for color / spacing / typography
- assets such as images / icons / fonts
- style-generating config such as `tailwind.config`

## Title Rules

- With an Issue reference, use the Issue title as-is
- Without one, an imperative verb + description within 72 characters
- No prefix such as `feat:` or `fix:`; strip it from the Issue title if present

## PR Template

- If the repository has a PR template, use it; otherwise use the bundled ${CLAUDE_SKILL_DIR}/templates/pr.md
- Case-insensitive, in priority order `.github/pull_request_template.md` > `pull_request_template.md` > `docs/pull_request_template.md` > a `PULL_REQUEST_TEMPLATE/` directory
- `gh pr create` does not auto-apply the template, so read the skeleton and fold it into the body
- When a repo template is adopted and UI changes are detected, add the 2 items § Pageshot Integration requires

## Design Decisions Detection

Aggregate `Design Decisions` across the whole PR, not per-commit, detecting from the diff and log in § Analysis Sources. Record a decision when any signal below is present; omit the section when the work is routine implementation with no explicit tradeoff.

- Explicit choice among equal alternatives
- Performance / type / compatibility tradeoff
- Deviation from existing patterns
- Library / API selection

## Pageshot Integration

Call `Skill("use-workflow-pageshot")` with the current PR body string as input. The body must contain a `Preview URL: <URL>` line near the top and a `## How to Test` section as a numbered list. The skill returns a single mode line on stdout.

- `mode=screenshot artifact=<path>` / `mode=video artifact=<path>` display the path and advise dragging it into the PR description or first comment on GitHub
- `mode=failed` report missing items, skip pageshot, and continue PR creation

## Push

After approval (§ Execution step 8), push the current branch with `git push -u origin HEAD`.

## Display Format

Preview shows title, base branch, current branch, summary bullets, and changes table. On success, display `Created PR: #<number> <title> <PR URL>`.
