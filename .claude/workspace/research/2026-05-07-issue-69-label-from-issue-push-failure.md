# Research: issue-69-label-from-issue-push-failure

Generated: 2026-05-07
Session: de066e0c-eb7a-484b-81a9-442890955aa0
Intent: Bug investigation
Domain: Infrastructure
Prior research: none found


## Purpose

Investigate why `.github/workflows/label-from-issue.yml` registers a 0s `failure` run on `push` events even though `on:` lists only `issues:` types, and identify the actual root cause behind the symptoms reported in thkt/scout#69.

## Key Findings

| Priority | Finding | Source | Next Action |
| -------- | ------- | ------ | ----------- |
| 1 | Root cause: the workflow file contains a literal Cloudflare email-obfuscation placeholder `[email protected]` where the action ref `parser@vN` should be. The bytes on disk are `stefanbuck/[email protected]` (hex `5b 65 6d 61 69 6c 20 70 72 6f 74 65 63 74 65 64 5d` = `[email protected]`). | `.github/workflows/label-from-issue.yml:17,24` (xxd dump 0xe2-0xf5 and 0x1ad-0x1c0) | Replace both `uses:` lines with the correct two-step pattern, then redeploy template |
| 1 | `actionlint` rejects the file: `specifying action "stefanbuck/[email protected]" in invalid format because ref is missing. available formats are "{owner}/{repo}@{ref}" or "{owner}/{repo}/{path}@{ref}"`. The corrupted token has no `@<ref>` suffix, so GitHub's parser also rejects it. | `actionlint --version 1.7.12` output on file at HEAD | Fix file; actionlint exits 0 on the corrected version |
| 1 | GitHub's workflow API registers this workflow's `name` as the file path `.github/workflows/label-from-issue.yml`, not the YAML's `name: Apply labels from issue form` on line 1. This is GitHub's parse-failure fallback. Sibling workflow `ci.yml` registers correctly as `"CI"`. | `gh api repos/thkt/scout/actions/workflows/269968856` returns `"name": ".github/workflows/label-from-issue.yml"`; `ci.yml` (id 248257390) returns `"name": "CI"` | None — diagnostic confirmation |
| 1 | All 23 of 23 runs of this workflow are `event=push`, `conclusion=failure`, with `total_count: 0` jobs. No `event=issues` runs exist. The intended trigger has never fired. | `gh run list --repo thkt/scout --workflow=label-from-issue.yml --limit 50` (Counter: `{'push': 23}` × `{'failure': 23}`); `gh api .../runs/25479878830/jobs` returns `total_count: 0`; `gh run list --event=issues` returns `[]` | None — quantifies impact |
| 2 | GitHub Actions creates a failed check run on the push that touches a malformed workflow file in order to surface the parse error. This is why `event: push` registers despite `on: issues:` — the file rejection happens before the `on:` clause is evaluated. The UI message confirms: `"This run likely failed because of a workflow file issue"` (from `gh run view 25479878830`). | `gh run view 25479878830 --repo thkt/scout`; comparison against `ci.yml` runs (which only register on push/PR per its `on:` clause, never on issues) | None — explains the issue's `push 0s failure` observation |
| 2 | Even after fixing the obfuscation, the current single-step usage is missing a required input. `redhat-plumbers-in-action/advanced-issue-labeler@v2` requires `issue-form:` (the parsed JSON from a parser step) — its `action.yml` declares `issue-form: required: true`. The workflow only passes `template:`, `section:`, `token:`, so even with a valid `uses:` ref, the run would fail with "input required and not supplied: issue-form". The intended pattern is two steps: `stefanbuck/github-issue-parser@v3` first to produce `outputs.jsonString`, then the labeler. | `gh api repos/redhat-plumbers-in-action/advanced-issue-labeler/contents/action.yml` decoded; README example lines 85-124 (verified via `scout repo-read`) | Adopt two-step pattern in fix |
| 2 | The policy file `.github/advanced-issue-labeler.yml:2` references a non-existent repo: `https://github.com/stefanbuck/advanced-issue-labeler`. The real repo is `redhat-plumbers-in-action/advanced-issue-labeler`. This stale comment likely seeded the action-name confusion in the workflow. The policy file's `template: [bug.yml, feature.yml]` and `section: [{id: priority, ...}]` fields are the labeler's *policy schema*, not workflow inputs — they map dropdown values (high/medium/low) to label names (priority:high/medium/low). | `/Users/thkt/GitHub/cli/scout/.github/advanced-issue-labeler.yml:2` (`# See https://github.com/stefanbuck/advanced-issue-labeler for syntax.`); compared with the real repo's README | Update comment in upstream template |
| 2 | The corruption originates upstream in the source template, not in scout's deploy pipeline. `thkt/github-labels` `templates/.github/workflows/label-from-issue.yml` contains the same byte sequence (verified via `gh api .../contents` + base64 decode + binascii). Fixing only scout's copy will be reverted on the next template-deploy run. | `gh api repos/thkt/github-labels/contents/templates/.github/workflows/label-from-issue.yml`; commit `50cd088` "feat: add Issue Forms + advanced-issue-labeler shared templates (Phase 4)" by `thkt` 2026-05-02 | Fix upstream first, then deploy |
| 3 | The issue body's three proposed remedies (A status quo / B `if:` guard / C split workflows) all miss the root cause. B cannot help because the file is rejected before any `if:` is evaluated; C propagates the corruption to two files. The real fix is byte-level correction of the action reference. | This research's elimination chain (Hypotheses Log) | Update issue or close-with-fix |

## Available Data

| Type | Item | Note |
| ---- | ---- | ---- |
| File | `/Users/thkt/GitHub/cli/scout/.github/workflows/label-from-issue.yml` | 578 bytes ASCII, LF, no BOM. Corrupted on lines 17, 24. |
| File | `thkt/github-labels:templates/.github/workflows/label-from-issue.yml` | Upstream source of the corrupted bytes (identical content). |
| File | `/Users/thkt/GitHub/cli/scout/.github/advanced-issue-labeler.yml` | Policy YAML (21 lines) mapping `[bug.yml, feature.yml]` × `priority` dropdown → `priority:{high,medium,low}` labels. Per-repo extension is permitted (line 4-6). Comment on line 2 references a wrong URL: `stefanbuck/advanced-issue-labeler` (does not exist) instead of `redhat-plumbers-in-action/advanced-issue-labeler`. |
| Action | `stefanbuck/github-issue-parser@v3` | Correct parser action; latest tag is `v3.2.3`; takes `template-path`, `issue-body`. |
| Action | `redhat-plumbers-in-action/advanced-issue-labeler@v2` | Correct labeler action; takes `issue-form`, `section`, `block-list`, `token`. |
| Run | `25479878830` | Reference run from issue body. `event=push`, `conclusion=failure`, jobs=`[]`, head_sha `3fb3e4c7`, branch `add-issue-forms-base`. |
| Run | `25255023585` | Older reference run from issue body. Same shape, `head_sha 43170385`, same branch. |
| Workflow ID | `269968856` | Registered in API with `name: .github/workflows/label-from-issue.yml` (path-as-name fallback). |
| Tech | `actionlint 1.7.12` | Confirms parse rejection: invalid `{owner}/{repo}@{ref}` format on lines 17 and 24. |
| Convention | Cloudflare Email Address Obfuscation | Replaces visible email-pattern strings in HTML with `[email protected]` placeholder + `/cdn-cgi/l/email-protection#<hex>` link. Triggered on any `<text>@<text>` substring. The `praser@v2.4` token (or `parser@v2.4`) was caught by this filter when the YAML was harvested from an HTML source. |

## Constraints

| Category | Constraint |
| -------- | ---------- |
| Process | Fix must originate in `thkt/github-labels` (upstream), otherwise scout's next template-deploy reverts the fix. ADR-0059 governs this rationale per PR #66 body. |
| Tooling | `actionlint` must pass on the corrected file. (Currently it fails; target is exit 0, matching `ci.yml`.) |

## Hypotheses Log

| # | Hypothesis | Discriminating test | Result |
| - | ---------- | ------------------- | ------ |
| 1 | YAML syntax error elsewhere in the file rejects the workflow before `on:` is evaluated | Parse the file with `actionlint`; check for `yaml-syntax` errors | Eliminated. `actionlint` reports only the two `uses:` lines. The YAML structure (top-level keys, indentation) is valid. |
| 2 | The `stefanbuck/...@2.4` action reference is malformed (missing `@<ref>` separator) and GitHub rejects the file at parse time | `actionlint` against the file; compare hex bytes of the `uses:` line; check API workflow `name` field for parse-fallback | **Confirmed**. `actionlint` reports `invalid format because ref is missing`. API `name` is the file path (parse-failure fallback). The literal bytes are `stefanbuck/[email protected]` with no `@vN` segment. |
| 3 | GitHub registers a failed check run on every push because the workflow file changed in that push's diff or because of a check-suite race | Check non-PR-related pushes (e.g. dependabot merges, recent main pushes) for workflow runs; compare `head_sha` to whether the workflow file is in the commit diff | Eliminated as primary cause. 23/23 push runs fail regardless of whether the commit touches `label-from-issue.yml`. The failure is the persistent parse rejection of the file at the current HEAD, not a per-commit transient. (Hypothesis 2 supersedes; check-runs created on push surface the parse error, which is the standard GitHub Actions behavior for malformed workflows.) |

## Disconfirmation Check

Covered by Phase 3 elimination. Hypothesis 2 is supported by four independent signals (actionlint exit-1, API `name` fallback, raw bytes, GitHub UI message). Hypothesis 3's "GitHub creates the run only when the file is in the diff" was tested against runs `25502987409` (Merge PR #79, does not touch the workflow) and `25494961557` (Merge PR #77, does not touch it) — both still fail, confirming the parse rejection is persistent at HEAD, not per-commit.

## References

| Path | Description |
| ---- | ----------- |
| `https://github.com/thkt/scout/issues/69` | This issue. |
| `https://github.com/thkt/scout/pull/66` | PR that introduced the broken workflow (auto-generated from `thkt/github-labels`, ADR-0059). |
| `https://github.com/thkt/scout/actions/runs/25479878830` | Reference failed run. |
| `https://github.com/thkt/scout/actions/runs/25255023585` | Older reference failed run. |
| `https://github.com/thkt/github-labels` | Upstream source of corrupted template. Path: `templates/.github/workflows/label-from-issue.yml`, commit `50cd088`. |
| `https://github.com/stefanbuck/github-issue-parser` | Correct parser action (`@v3`, current `v3.2.3`). |
| `https://github.com/redhat-plumbers-in-action/advanced-issue-labeler` | Correct labeler action (`@v2`). |
| `https://developers.cloudflare.com/.../email-address-obfuscation/` | Source of the `[email protected]` placeholder pattern (see `scout search` results in this session). |

## Coverage Notes

- All Phase 1 questions answered. Root cause and fix path identified.
- Defer to `/fix`: choosing the exact pin (`parser@v3` major vs `v3.2.3` exact, `labeler@v2` major vs exact), and the per-repo deduplication of bug.yml/feature.yml parsing.

## Next Steps

| Intent | Next Command |
| ------ | ------------ |
| Bug investigation | `/fix` |
