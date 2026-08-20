# How to write a PR

How to settle the title, choose the skeleton for the body, and what goes in each section. Read by `/pr`'s Phase 2 and the build workflow's Ship.

## Title

- With an issue reference, use the issue title as it stands
- Without one, stay within 72 characters and open with an imperative verb
- Add no `feat:` or `fix:` prefix. Strip one the issue title carries

## Choosing the skeleton

`gh pr create` does not apply the skeleton on its own. Read it and fold it into the body.

Use the repository's PR template when it has one. Without one, use `../templates/pr.md`, relative to this file. The repository side is matched case-insensitively; take the first that exists in this order.

1. `.github/pull_request_template.md`
2. `pull_request_template.md`
3. `docs/pull_request_template.md`
4. A `PULL_REQUEST_TEMPLATE/` directory

## Language

Write the body in the language `language` names in `~/.claude/settings.json`. Default to English when it is unset. Leave code, identifiers, and technical terms untranslated.

## Section order

Order the sections so a reader grasps it fast. Lead with the problem it solves and the state it reaches. Then what changed and the approach, and last where to focus review.

## What each section carries

Write nothing you have not verified. `../templates/pr.md` carries an OK and NG example per section under Guidelines. The same bar applies when the repository's skeleton was taken.

| Section          | What to write                                                                          |
| ---------------- | -------------------------------------------------------------------------------------- |
| Changes          | Only a change whose rationale the diff does not carry. No inventory of files           |
| Review focus     | The skeleton's nearest section, or a `## Review focus` section when it has none        |
| Design Decisions | A choice made explicitly among equal alternatives. Omit the section when there is none |
