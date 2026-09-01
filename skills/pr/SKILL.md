---
name: pr
description: Analyzes branch changes and opens a draft pull request. Detects the base branch from where this one was cut, refines the body through a prose review before it goes up, and captures a screenshot when the change touches the UI.
when_to_use: PR作って, プルリクエスト, pull request, PR作成
allowed-tools: Bash(git:*) Bash(gh:*) Bash(cat:*) Read Skill
model: opus
argument-hint: "[issue reference or context]"
---

# /pr - Pull Request Creator

The manual counterpart of build's Ship stage. Both write the body from the same rules.

## Input

`$ARGUMENTS` is an Issue reference or context. If empty, generate from the current branch only.

## Phase 1: Preparation

If there are no commits, the directory is not a git repository, or gh auth fails, report the error and abort.

1. Detect the base branch (§ Base Branch Detection)
2. Run the § Analysis Sources commands in parallel
3. Decide whether the change touches the UI (§ UI Change Detection). Phase 2 and Phase 3 both read this decision

## Phase 2: Generation

1. Choose the skeleton and write the body per ${CLAUDE_SKILL_DIR}/references/pr-writing.md. Fill Design Decisions per § Design Decisions Detection
2. When the change touches the UI and the repository's skeleton was taken, supply the two items § Pageshot Integration requires. The bundled skeleton carries both already, so nothing is needed there
3. Give it a title per § Title in ${CLAUDE_SKILL_DIR}/references/pr-writing.md
4. Refine the body inline against ${CLAUDE_SKILL_DIR}/references/prose-review.md

## Phase 3: Creation

1. If UI changes, invoke `use-workflow-pageshot` via Skill with the PR body (§ Pageshot Integration)
2. Push the current branch with `git push -u origin HEAD`
3. Write the body to a temp file and create the PR with `gh pr create --draft --title "<title>" --body-file <path>` (§ Creation Constraints)
4. If a pageshot artifact exists, display it (§ Pageshot Integration). On success, display `Created draft PR: #<number> <title> (base: <base>) <PR URL>`

## Analysis Sources

`<base>` is the value § Base Branch Detection settled.

| Category | Source                                                               |
| -------- | -------------------------------------------------------------------- |
| Changes  | `git diff <base>...HEAD`                                             |
| Commits  | `git log <base>..HEAD`                                               |
| Files    | `git diff --name-status <base>...HEAD`                               |
| Issue    | `gh issue view <ref> --json title`, only when `$ARGUMENTS` names one |

## Base Branch Detection

Take the branch this one was cut from out of HEAD's reflog. The first command prints `checkout: moving from <base> to <branch>`; take `<base>` from it. When it prints nothing, or the second command exits non-zero (the result is not an ancestor of HEAD), take the third command's output. When that fails too, fall back to main.

```bash
git reflog --format=%gs --grep-reflog="moving from .* to $(git branch --show-current)$" -1
git merge-base --is-ancestor <base> HEAD
gh repo view --json defaultBranchRef --jq .defaultBranchRef.name
```

## UI Change Detection

Read the diff from § Analysis Sources and judge whether the rendered result stays the same. When you cannot say it does, the change touches the UI. Pageshot's rendering is the final judge, so lean toward a UI change when in doubt.

The rendered result stays the same only for changes like these.

- Type definitions, tests, documentation, or comments alone
- A rename or an extracted function, where the output is unchanged
- Build or tooling config that does not reach how anything looks

## Design Decisions Detection

Aggregate `Design Decisions` across the whole PR, not per-commit, detecting from the diff and log in § Analysis Sources. Record a decision when any signal below is present.

- Explicit choice among equal alternatives
- Performance / type / compatibility tradeoff
- Deviation from existing patterns
- Library / API selection

## Creation Constraints

It goes up as a draft because a human reads the body before marking it ready.

Nothing confirms during this phase. The draft state and the base on the result line are the only paths to noticing a mistake.

Pass the body through `--body-file` rather than `--body`. A template-derived body contains backticks and `$`, and `--body` lets the shell interpret them.

## Pageshot Integration

Call `Skill("use-workflow-pageshot")` with the current PR body string as input. The body must contain a `Preview URL: <URL>` line near the top and a `## How to Test` section as a numbered list. The skill returns a single mode line.

- `mode=screenshot artifact=<path>` / `mode=video artifact=<path>` display the path and advise dragging it into the PR description or first comment on GitHub
- `mode=failed` report missing items, skip pageshot, and continue PR creation
