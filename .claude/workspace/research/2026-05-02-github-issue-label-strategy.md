# Research: github-issue-label-strategy

Generated: 2026-05-02
Session: 6c9d30ef-6896-4967-9f83-a04259f56a6d
Intent: Understanding (label strategy decision support)
Domain: General (cross-repo organizational convention)
Prior research: none found

## Purpose

Investigate GitHub label strategy best practices in order to design a consistent,
scale-tolerant labeling convention for both personal CLI repos (low traffic, solo
maintainer) and team products (multi-area, multi-contributor) without introducing
schema overhead before it earns value.

## Key Findings

| Priority | Finding                                                                                                                                                                                                                                                                                                                                                | Source                                                                                                                | Next Action                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| 1        | Prefix scheme is scale-dependent, not universally best practice. K8s (200+ labels, multi-SIG) uses `area/` `kind/` `priority/` `sig/`. Rust (200+ labels) uses single-letter `A-` `T-` `I-` `C-` `P-` `WG-`. Node.js (200+ labels) operates with a flat naming scheme and no global prefix and remains functional. GitHub defaults are 9 labels with no prefix. | gh label list of `kubernetes/kubernetes`, `rust-lang/rust`, `nodejs/node`, `octocat/Hello-World` (2026-05-02)         | Decide tier per repo (small / shared / multi-area)                       |
| 1        | One color per category prefix is the cleanest visual rule. Rust enforces it (`A-*` = #f7e101 yellow, `C-*` = #f5f1fd lavender, `E-*` = #02e10c green, `I-*` = #e10c02 red, `O-*` = #6e6ec0 purple, `T-*` = #bfd4f2 blue, `WG-*` = #c2e0c6 mint). Priority is the exception that uses a graduated red→orange→yellow scale.                                  | `/tmp/rust-labels.json`, `/tmp/k8s-labels.json` priority slice                                                       | Adopt single-color-per-prefix rule, with graduated palette only for ordinal axes (priority, effort) |
| 1        | GitHub's 9 default labels (`bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix`) are used unmodified in all 4 sampled `thkt/*` CLI repos and remain functional at solo-maintainer scale. Removing them is rarely the right starting move; extending them is.                            | docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels (2026-05-02), thkt/{yomu,kiku,scout,shields} | Keep defaults. Add the minimum extra set actually used                   |
| 2        | Issue Forms (`.github/ISSUE_TEMPLATE/*.yml`) + `stefanbuck/advanced-issue-labeler` is the dominant native-GitHub auto-label pattern as of 2026. `github/issue-labeler` (regex against title/body) is the fallback when forms are not used. Probot apps (autolabeler, etc.) are the third tier and add a third-party hosting dependency.                    | scout search "GitHub Actions actions/labeler probot auto-label issue templates" (2026-05-02)                          | Adopt issue forms first; layer regex labeler only if forms are not viable |
| 2        | `github-label-sync` (NPM, configured by YAML/JSON, supports aliases, dry-run, and removal of unlisted labels) is the canonical multi-repo sync tool. Aliases preserve issue history when renaming labels.                                                                                                                                              | scout search "github label sync github-label-sync tool" (2026-05-02), `Micnews/github-label-sync` README              | Use only after a shared scheme is decided. Premature sync re-creates the sprawl problem at scale |
| 2        | Anti-patterns observed across repos: Domain-prefixed labels with random colors (TypeScript `Domain: *` uses 39 distinct colors; harder to scan than benefit), area-prefix sprawl without retirement policy (K8s `area/*` has 83 entries; many unused for years), redundant priority labels (`priority/low` when label-less can mean low).                  | `/tmp/typescript-labels.json`, `/tmp/k8s-labels.json`, scout search "GitHub label antipattern" (2026-05-02)         | Inventory existing labels before adding more. Define a retirement signal (e.g., zero applied issues for 6 months → review) |
| 2        | At least one status-class label per issue is the operational rule (`status:*` or workflow stage). Multi-status on one issue defeats the purpose. Type and area can be multi-applied; priority and status should not.                                                                                                                                  | scout search "GitHub issue labels best practices type priority status area effort" (2026-05-02)                       | Document the "one priority, one status" constraint in CONTRIBUTING.md   |
| 3        | Kebab-case + lowercase is the GitHub URL-internal convention (`good-first-issue` in URLs). Labels with spaces work but cost typing effort and break some tooling that expects kebab. Practical: kebab-case for new labels, accept the GitHub-default label set as-is (which uses `good first issue`, `help wanted` with spaces).                          | scout search "GitHub label naming convention prefix kebab-case category color" (2026-05-02)                           | Enforce kebab-case for all new labels                                   |
| 3        | Separator choice (`/`, `:`, `-`) is project-specific. K8s uses `/` (slash creates filesystem-like grouping in label list UI), TypeScript and seantrane use `:`, Rust uses single-dash `A-`. None are GitHub-required. Convention should match repo culture and stay internally consistent.                                                            | label JSON exports of K8s, TypeScript, Rust (2026-05-02)                                                              | Pick one separator per repo. `/` reads best for GitHub UI grouping       |

## Available Data

| Type       | Item                                                                            | Note                                                                                                |
| ---------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| File       | `/tmp/{typescript,react,vscode,k8s,rust,nextjs,node,ghcli}-labels.json`         | Raw label exports captured 2026-05-02 via `gh label list --json name,color,description`             |
| Doc        | docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels | Authoritative spec on labels (defaults, creation, deletion, organization defaults)              |
| Convention | Rust label scheme                                                               | Single-letter prefix (`A-` Area, `B-` Blocker, `C-` Category, `E-` Experience, `I-` Issue kind, `O-` OS, `P-` Priority, `S-` Status, `T-` Team, `WG-` Working Group, `F-` Feature) |
| Convention | Kubernetes Prow labels                                                          | `area/`, `kind/`, `priority/`, `sig/`, `triage/`, `lifecycle/`, `tide/`, `do-not-merge/` (load-bearing for the Prow bot, not just classification) |
| Convention | TypeScript label scheme                                                         | `Domain: *` for technical area + flat workflow labels (`Bug`, `By Design`, `Won't Fix`, `Suggestion`, `Needs More Info`)                                            |
| Convention | VS Code label scheme                                                            | Flat kebab area names (`workbench-*`, `editor-*`, `api`, `debug`) + workflow labels (`info-needed`, `verified`, `important`)                                       |
| Convention | Next.js label scheme                                                            | Mostly flat; `created-by:` and `linear:` are the only prefixes; uses a free-form palette (poor color discipline overall) |
| Convention | Node.js label scheme                                                            | Flat, mostly subsystem names (`zlib`, `worker`, `webcrypto`, `wasm`); proves prefix scheme is not required for a 200+ label repo |
| Tool       | `stefanbuck/advanced-issue-labeler` + `stefanbuck/github-issue-parser`          | Native GitHub Action; maps Issue Forms dropdowns/checkboxes to labels via `.github/advanced-issue-labeler.yml` |
| Tool       | `github/issue-labeler`                                                          | Regex-based labeler over issue title/body; uses `.github/labeler.yml`                              |
| Tool       | `Micnews/github-label-sync` (NPM)                                               | YAML/JSON-driven sync from a leader source; supports aliases (rename without losing history), dry-run, and unlisted-label removal |
| Reference  | Sean Trane "Logical GitHub Labels" / `seantrane/github-label-presets`           | Public preset for type/effort/priority with a coherent color palette                              |
| Tech       | GitHub default labels (9)                                                       | `bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix` |
| Env        | thkt/{yomu,kiku,scout,shields}                                                  | Currently use only GitHub defaults + occasionally `P1/P2/P3`, `ci`, `dependencies`, `rust`. Tally has no labels at all |

## Constraints

| Category    | Constraint                                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Cost        | Solo maintainer per CLI repo. Any label scheme must be applicable in under 30 seconds per issue or it will not be applied          |
| Scale       | 20+ personal CLI repos visible in cwd (yomu, kiku, scout, ...). A scheme that requires per-repo manual creation is operationally untenable; sync tooling (or no sync) are the only viable choices |
| Compatibility | GitHub default labels are auto-created on every new repo. Any scheme that fights the defaults (e.g., requires their deletion) costs a setup step on each new repo |
| Tooling     | `gh` CLI is the user's primary GitHub interface. Label scheme must be queryable by `gh issue list --label <foo>` ergonomically (kebab-case + clear prefix wins) |

## Disconfirmation Check

Searched for a counter-example to "structured prefix schemes are best practice."

Result: Found. Node.js (`nodejs/node`) operates a 200+ label repo with a mostly flat naming scheme and no global prefix. GitHub's own defaults are 9 unprefixed labels used by millions of repos.

Implication: prefix discipline correlates with multi-team ownership and contributor onboarding load, not with project quality. A solo CLI repo can stay with GitHub defaults indefinitely without dysfunction. A multi-team project with regular new-contributor flow benefits enough from prefixed taxonomy to justify the upfront design.

The "推し案" recommendation in this report is therefore tiered, not universal.

## Strawman Strategy: Three-Tier Recommendation

### Tier 1: Solo CLI repo (low traffic, solo maintainer) [recommended for thkt/* CLI repos]

| Decision  | Choice                                                                            | Why                                                                          |
| --------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Label set | GitHub 9 defaults + `priority:high` only                                          | Defaults already cover bug/feature/docs/duplicate/help. Priority is the one signal not in defaults that solo workflow needs (top of stack vs not) |
| Color     | Defaults retained                                                                 | Editing defaults to match a custom palette costs setup time without payoff |
| Prefix    | None                                                                              | Below 15 labels, prefixes add noise without aiding scan                      |
| Status    | Skip dedicated status labels; use GitHub Project status column or issue state     | Status labels duplicate Project boards at solo scale                         |

Weakness: when a CLI grows multi-component (e.g., yomu has fetcher / chunker / embedder / storage), area context is missing. Mitigation: add `area:<component>` (or just `<component>` flat names like Node.js style) only when the component count exceeds 5 and issues frequently span them.

Alternative considered: jump straight to Tier 3. Rejected because it imports overhead unjustified by current issue volume (most thkt/* repos have <10 open issues).

### Tier 2: Cross-CLI shared scheme (when consistency across repos starts to matter)

| Decision  | Choice                                                                                       | Why                                                                                  |
| --------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Label set | Tier 1 + `type:*` (bug/feature/chore/docs), `priority:*` (P0/P1/P2/P3), `status:blocked`, `status:wontfix-pending`  | Replaces the GitHub default `enhancement` with `type:feature`. Keeps `bug` if you accept the duplicate; otherwise migrate to `type:bug` |
| Color     | One color per prefix (Rust rule). `type:*` blue, `priority:*` graduated red/orange/yellow, `status:*` purple | Visual scan beats reading                                                            |
| Prefix    | `:` separator (matches seantrane / TypeScript Domain convention; reads naturally)            | `/` works too. Pick one and stick with it. `-` (Rust style) is shorter but less self-documenting |
| Sync      | `github-label-sync` with a leader config in a dedicated repo (e.g., `thkt/github-labels`)    | Single source of truth. Aliases let you rename `enhancement` → `type:feature` without losing past issues |

Weakness: the moment you sync to all 20+ repos, every default-label change creates a sweep. Mitigation: dry-run before each sync push, and never run `--allow-removed-labels` against repos with active issues.

Alternative considered: `dwyl/labels` (UI-driven). Rejected because it does not version-control the label config in git, which defeats the point of cross-repo consistency.

### Tier 3: Team product (multi-area, multi-contributor)

| Decision  | Choice                                                                                                                            | Why                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Label set | Tier 2 + `area:<component>` for the actual code areas + `effort:*` (S/M/L) + `good first issue` + `help wanted`                   | Multi-contributor onboarding requires `good first issue` and `effort` for self-selection. `area:*` routes to owners |
| Color     | Same one-color-per-prefix rule. `area:*` blue (K8s convention), `effort:*` green graduated, `type:*` distinct color from `area:*` to avoid scan confusion | The K8s-style discipline pays off above ~30 labels                                                 |
| Prefix    | `:` separator. Long-form names (`area:authentication` not `A-auth`)                                                               | New contributors do not know the legend. Single-letter prefixes (Rust style) work for repos where contributors stay long-term but cost onboarding for shorter cycles |
| Automation | Issue Forms (`.github/ISSUE_TEMPLATE/*.yml`) + `stefanbuck/advanced-issue-labeler` to apply `type:*`, `area:*` from form selections | Label hygiene falls apart when humans are the only label source                                    |
| Status    | `triage:needed` (auto-applied on open) → `status:in-progress` (auto on PR linked) → close. At most one `status:*` per issue       | Mirrors VS Code triage flow. One status label per issue is the discipline that prevents conflict   |

Weakness: every new component requires a new `area:*` label, and old `area:*` labels accumulate when components are renamed or removed. Mitigation: schedule a quarterly retirement pass — list `area:*` labels with zero applied issues in the last 6 months, retire them.

Alternative considered: Kubernetes-scale `sig/`, `wg/`, `tide/`, `do-not-merge/`. Rejected for typical team product because Prow-class merge bot infrastructure is not in place; without the bot the labels are decorative.

## Comparison: How Major OSS Differ

| Repo               | Label count (sampled) | Prefix scheme                      | Color discipline                                     | Distinguishing feature                                                                |
| ------------------ | --------------------- | ---------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| GitHub defaults    | 9                     | none                               | distinct hue per label                               | Universal baseline. `good first issue` populates the repo's `/contribute` page automatically |
| `microsoft/TypeScript` | 100 (sampled)      | `Domain: *` (39 labels)            | Domain colors are random and visually noisy          | Strong domain taxonomy, weak color rule                                              |
| `facebook/react`   | 76                    | `Component: *`, `Type: *`, `Resolution: *`, `Status: *` | Mixed; `Type:Bug Report` red, `Type:Discussion` blue | Multiple coexisting prefix schemes (Component vs Type)                              |
| `microsoft/vscode` | 200+                  | flat kebab area names (`workbench-*`, `editor-*`) | Most areas are uniform `#c5def5` blue, criticality stands out | Bot-driven triage flow with 50+ status-style labels (`*needs-info`, `verified`, etc.) |
| `kubernetes/kubernetes` | 200+              | `area/`, `kind/`, `priority/`, `sig/`, `triage/`, `lifecycle/`, `tide/`, `do-not-merge/` | Strict per-prefix color (priority graduated, area uniform blue) | Prow bot makes labels load-bearing for merge automation, not just taxonomy           |
| `rust-lang/rust`   | 200+                  | `A-` `B-` `C-` `E-` `F-` `I-` `O-` `P-` `S-` `T-` `WG-` (single-letter) | One color per prefix; clearest visual scan in sample | Compact prefix saves character budget at cost of legend lookup for new contributors  |
| `vercel/next.js`   | 86                    | mostly flat with random `created-by:`, `linear:` exceptions | Free-form per-label palette (worst sampled)         | Cautionary example of organic growth without retirement policy                        |
| `nodejs/node`      | 200+                  | flat, no global prefix             | per-label                                            | Disconfirms the claim that prefixes are required at scale                            |
| `cli/cli` (gh CLI) | 78                    | flat with `gh-*` and `priority-N`  | mixed                                                | Closest precedent in size and structure to thkt/* CLI repos                          |

## Anti-Patterns Inventory

| Anti-pattern                                                              | Source observed                            | Mitigation                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Domain labels with arbitrary colors (no per-prefix discipline)            | TypeScript `Domain: *` (39 unique colors)  | Pick one color per prefix; reserve graduated palettes for ordinal axes only                 |
| Area-prefix sprawl without retirement                                     | K8s `area/*` (83 entries; many dormant)    | Quarterly retirement pass on labels with zero applied issues in 6 months                    |
| Redundant low-priority label                                              | (general advice, openrefine docs)          | Make label-less the implicit "low/normal." Only label issues that are exceptional           |
| Multiple status labels per issue                                          | (general advice)                           | Document "one priority, one status" rule in CONTRIBUTING                                    |
| Vague / overlapping labels (`UX` and `Usability`)                         | (Sean Trane post)                          | Each label needs a written description. If two labels share a description, merge them       |
| Premature prefix scheme on a 5-issue repo                                 | hypothetical (my own risk on thkt/*)       | Stay on Tier 1 until issue volume earns Tier 2                                              |
| Free-form palette growth                                                  | Next.js (90% of labels have unique colors) | Define a fixed palette before adding any new color                                          |
| Renaming labels without `aliases`                                         | (`github-label-sync` docs)                 | Always use `aliases:` field when renaming via sync tool                                     |
| Issue templates that do not auto-label                                    | (general)                                  | Pair `.github/ISSUE_TEMPLATE/*.yml` Issue Forms with `stefanbuck/advanced-issue-labeler`     |
| Third-party Probot apps when native Actions suffice                       | (auto-label search)                        | Default to GitHub Actions; reach for Probot only when needed (Actions cover ~95% of cases) |
| Adding labels to track project status that GitHub Projects already tracks | (VS Code overlap risk)                     | Use Projects for status when contributor count justifies a board; use status labels only when issues without a board need a workflow signal |

## Application to User's Case

| Context                            | Recommendation                                                                                                                      | Why                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `thkt/{yomu,kiku,scout,shields}`   | Stay on Tier 1 (defaults + `priority:high`)                                                                                         | Issue volume per repo is low; current scheme is functional                                         |
| `thkt/tally` (no labels yet)       | Apply Tier 1 baseline now; revisit at first multi-component issue                                                                   | Fresh repo; no migration cost                                                                      |
| Future: 5+ active CLI repos with shared contributors | Promote to Tier 2 with `thkt/github-labels` leader repo + `github-label-sync` in CI                                       | The point at which inconsistency starts costing more than the sync setup                           |
| Team product (work)                | Tier 3 from the start (issue forms + auto-labeler + retirement schedule)                                                            | Multi-contributor onboarding load makes the upfront taxonomy investment worthwhile                 |

## References

| Path                                                                                                  | Description                                                                                  |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels           | GitHub official label spec (defaults list, creation, deletion)                              |
| https://github.com/seantrane/github-label-presets                                                     | Sean Trane "Logical GitHub Labels" preset                                                    |
| https://www.npmjs.com/package/github-label-sync                                                       | `github-label-sync` NPM package documentation                                                |
| https://github.com/stefanbuck/advanced-issue-labeler                                                  | Issue Forms based auto-label action                                                          |
| https://github.com/github/issue-labeler                                                               | Regex based auto-label action                                                                |
| https://github.com/microsoft/TypeScript/labels                                                        | Reference: `Domain: *` taxonomy (and weak color discipline counter-example)                  |
| https://github.com/kubernetes/kubernetes/labels                                                       | Reference: `area/`, `kind/`, `priority/`, `sig/`, `triage/`, `lifecycle/`, `tide/`, `do-not-merge/` |
| https://github.com/rust-lang/rust/labels                                                              | Reference: single-letter prefix + one-color-per-prefix discipline                            |
| https://github.com/microsoft/vscode/wiki/Issue-Tracking                                               | VS Code triage workflow (cited in scout search; not directly fetched)                       |
| `/tmp/{typescript,react,vscode,k8s,rust,nextjs,node,ghcli}-labels.json`                               | Raw label captures used for comparison                                                       |

## Coverage Notes

All 7 観点 from the request are addressed:

1. Categorization principles → Strawman three-tier section, "Key Findings" priority 1
2. Naming convention → "Key Findings" priority 3 (kebab-case, separator)
3. Color usage → "Key Findings" priority 1 (one color per prefix), Tier 2/3 details
4. Default labels → "Key Findings" priority 1, Tier 1 strategy
5. Automation → "Key Findings" priority 2, Tier 3 details
6. Anti-patterns → Anti-Patterns Inventory section
7. OSS comparison → Comparison table (8 repos)

Open question (unknown, requires action): user's team product's actual code-area decomposition is not visible from cwd repos. The Tier 3 `area:*` list cannot be enumerated until the team product is named; resolve in the planning step before implementation.

## Next Steps

| Intent             | Next Command                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Feature planning   | `/think` — convert the Tier 1/2/3 strawman into a label config (YAML) plus a CONTRIBUTING.md snippet, scoped to a single starting repo      |
| Bug investigation  | n/a (this was an Understanding research)                                                                                                    |
| Understanding only | complete                                                                                                                                    |
