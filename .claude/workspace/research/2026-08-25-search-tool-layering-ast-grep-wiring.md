# Research: search-tool-layering-ast-grep-wiring

Generated: 2026-08-25
Session: bb21da66-fdac-41f1-a5f9-70058c6f45b9
Intent: Feature planning
Domain: General
Prior research: none found (see References for the shared=1 filename hit)

## Purpose

Inventory how `ugrep`/`bfs`/`codegraph` are wired into the harness today, identify what `ast-grep` does that none of them can, and decide where a selection rule must live so that installing the binary translates into use.

## Key Findings

| Priority | Finding | Source | Next Action |
| -------- | ------- | ------ | ----------- |
| P1 | Tool permission is granted on **three independent surfaces**, not one. `settings.json` `permissions.allow` covers the main loop (`Bash(ugrep *)`, `Bash(bfs *)` present; no ast-grep, no codegraph). Skill frontmatter `allowed-tools:` covers skill-scoped runs (`skills/use-cli-codegraph/SKILL.md:5` = `Bash(codegraph:*) Read`; `skills/research/SKILL.md:5` carries ugrep + bfs + codegraph). Agent frontmatter `tools:` is a hard allowlist for forks. `ast-grep` appears on none of the three. | `settings.json` permissions dump (46 allow entries); `skills/use-cli-codegraph/SKILL.md:5`; `skills/research/SKILL.md:5`; per-agent `tools:` dump of all 30 `agents/**/*.md` | Answers Q1 and Q4 — wiring ast-grep means editing at least two surfaces, and which two is the design decision. Feeds `/think`. |
| P1 | **26 of 28 agent definitions grant scoped Bash and therefore cannot call ast-grep even if `settings.json` allowed it.** Every reviewer / critic / enhancer / explorer / generator-test file carries `tools: … Bash(ugrep:*), Bash(bfs:*)` and nothing wider. The two exceptions are `agents/resolvers/resolver-build.md` (`tools: Bash, Read, Edit, LS` — bare `Bash`, so it could invoke ast-grep, gated only by `settings.json`, which lacks the entry and would prompt) and `agents/generators/generator-snapshot.md` (`Bash(python3:*)` only). The 30 `.md` files under `agents/` include 2 non-agent `_lib/` files. | `for f in $(bfs . -name '*.md'); do grep -m1 '^tools:' "$f"; done` over `/Users/thkt/.claude/agents` — full output in Disconfirmation Check | Answers Q1 — the user's "reviewer 系エージェントは呼び出せない" premise is confirmed, and the mechanism is the per-agent allowlist, not `settings.json`. Feeds `/think`. |
| P1 | **The rule file that used to hold the search-tool selection table no longer exists, and its content was never re-homed.** `rules/development/TOOLS.md` carried a "Code search" table mapping task → tool. ADR-0072 (2026-06-09) rewrote it to unify on ugrep/bfs. Two days later `f2819b56` (2026-06-11) deleted it, along with 17 other rule files, under the message "Update .gitignore, README, and various documentation files for improved clarity and organization". No DR records the deletion. `docs/CLI_TOOLS.md` covers only scout / recall / sae / xr, so ugrep, bfs, and codegraph have no selection rule anywhere in `rules/` today. | `git log --follow -- rules/development/TOOLS.md`; `git show f2819b56 --name-status \| grep '^D'` (18 rule files deleted, both `.ja/` and English); `git show f2819b56^:rules/development/TOOLS.md`; `ugrep -r -e 'Code search' -e 'ツール選択' rules/ .ja/rules/` → 0 hits | Answers Q3 — the `rules/` slot is empty and unclaimed, but its emptiness is the result of an untitled bulk cleanup, not a recorded policy. `/think` must decide whether to reopen it. |
| P1 | **codegraph is the working precedent for "installed and actually used", and it took three surfaces.** (1) `skills/use-cli-codegraph/SKILL.md` holds the how plus `allowed-tools`. (2) Its `description:` supplies the discovery keywords. (3) `skills/research/references/tactics.md:9-11` supplies the enforcement: "codegraph first (when a `.codegraph/` index exists)" and "A ugrep / grep search for the symbol name is not accepted as a source for the same questions." Surface (3) is what converts availability into use; a skill alone only loads on a keyword match. | `skills/use-cli-codegraph/SKILL.md:2-5,13-21`; `skills/research/references/tactics.md:9-11`; `skills/research/SKILL.md:51` | Answers Q3 — the answer is the three-surface pattern, not a single location. Feeds `/think`. |
| P1 | **The discriminating test for whether to wire ast-grep at all: can its trigger be stated as concretely as "when a `.codegraph/` index exists"?** codegraph's trigger is a filesystem fact the model can check. ast-grep has no equivalent condition written anywhere, and this repo supplies weak material for one: the harness is 280 `.md` files against 76 `.py` + 65 `.js` + 17 `.ts` + 4 `.tsx` (162 parseable), and ast-grep parses none of the Markdown. The repo's own recurring sweep procedure (`docs/wiki/horizontal-scope-by-ugrep.md`) is Markdown-centric by design. | `bfs agents skills rules hooks workflows docs tests -type f \| sed 's/.*\.//' \| sort \| uniq -c`; `ast-grep run --help` (`--lang`); `docs/wiki/horizontal-scope-by-ugrep.md` | Answers Q3 — if no trigger condition can be written, the tool goes unused wherever it is documented, and that is the YAGNI answer with evidence rather than a deferral. Feeds `/think` as the go / no-go gate. |
| P1 | **Premise 4 is refuted. `/Users/thkt/GitHub/cli/guardrails` has no `CLAUDE.md` at all, and the string `ast-grep` appears nowhere in it.** The repo relies on the global `~/.claude/CLAUDE.md`. A sweep of all 35 `CLAUDE.md` files under `~/GitHub` and `~/.claude` found zero mentions of ast-grep. The adjacent fact that is true: guardrails does carry a `.codegraph/` index at its root. | `ls -a /Users/thkt/GitHub/cli/guardrails` (no CLAUDE.md; `.codegraph` present); `ugrep -r --hidden 'ast-grep'` + `grep -rIn 'ast-grep'` over the repo → 0 hits both; loop over 35 `CLAUDE.md` files → 0 hits | Answers Q4 — this premise imposes no requirement. Report to the user before `/think` so the plan is not built on it. |
| P1 | **A prior ast-grep evaluation exists and it was decided against, but the recorded reason is not YAGNI.** In session `e4ed9b7a` (2026-04-13, cwd `/Users/thkt/.claude`), ast-grep was tabled as one of three options for static pattern extraction in a PostToolUse hook. The user chose the third: "Rust カスタム parserでts,rust向けに作るのが良い", with tree-sitter for TS and `syn` for Rust, LLM naming, and human review. The assistant's closing note before that was "まず「何のパターンを取りたいか」を絞ってから tool 選択した方がええ" — a deferral pending a named use case. | `recall show e4ed9b7a-db7e-4264-8430-263e7fbe9569 --chunk 10671 --window 3` | Answers Q3 — the same gate is being reopened: name the pattern first, then pick the tool. Cite this instead of the unlocatable hash. |
| P2 | **The niche ast-grep would occupy for mechanical prohibition is already partly held, and the real trade-off is YAML rule vs Rust rule.** Incumbents: oxlint (js/ts, devDependency), ruff with 12 rule families selected (py, `ruff.toml:5`), and thkt's own `guardrails` binary, an oxc-AST scanner whose custom rules are Rust (`src/rules/naming.rs`). guardrails gives thkt *his own* rules at the cost of a Rust rule plus a release cycle; oxlint and ruff give *their* rules, not his. `ast-grep scan` gives his own rules in `sgconfig.yml` with no compile step. | `ast-grep --help` (subcommands `run` / `scan` / `test` / `lsp` / `outline`); `ast-grep run --help` (`-r, --rewrite <FIX>`); `package.json` devDependencies; `ruff.toml:5`; `docs/SPEC.md:31`; guardrails `.claude/workspace/research/2026-08-11-hook-naming-ast-vs-oxlint-delegation.md` | Answers Q2 — frame the decision as YAML rule vs Rust rule when it reaches `/think`. |
| P2 | **`-r/--rewrite` is the one capability none of the four incumbents has.** ugrep and bfs match text and paths; codegraph answers symbol structure read-only; oxlint / ruff / guardrails report and block. Structural search-and-replace across a language's AST (`ast-grep run -p <pattern> -r <fix>`) has no substitute in the current set. `outline` (symbols / imports / exports / members) overlaps codegraph but works without an index. | `ast-grep --help`; `ast-grep run --help`; `skills/use-cli-codegraph/SKILL.md:27-34` | Answers Q2 — this is the strongest single argument for adoption. Feeds `/think`. |
| P2 | **codegraph itself was added without a DR**, so ast-grep would be the second search tool to enter with no recorded decision. `ugrep -r -l 'codegraph' docs/decisions/` returns 0 files, while ADR-0072 governs ugrep/bfs and explicitly names the loss of dependency-graph search as a Reassessment Trigger — the trigger codegraph silently answered. | `ugrep -r -l -I 'codegraph' docs/decisions/` → 0 files; `docs/decisions/0072-discontinue-yomu-and-unify-code-search-on-ugrep.md` § Reassessment Triggers | Protects the OUTCOME Behavior "AI agent は harness が定めた品質ゲートを裁量で迂回できない" — an unrecorded tool layer is a gate no one can check. Write a DR alongside the wiring. |
| P2 | **ADR-0072's Reassessment Triggers do not cover ast-grep.** The three triggers are concept search, impact analysis loss, and local-embedding ROI. Structural rewrite and mechanical prohibition are outside all three, so adding ast-grep does not reopen ADR-0072; it needs a decision of its own. | `docs/decisions/0072-...md` § Reassessment Triggers | Answers Q3 — a new DR, not an amendment to 0072. Feeds `/think`. |
| P3 | **`docs/wiki/` is a fourth placement option with a path-glob auto-load mechanism**, and it already hosts one tool-usage page. 13 of the 24 wiki pages carrying frontmatter have a non-empty `globs:` array (e.g. `command-parse-by-position.md` → `**/hooks/**/*.py`); the other 11, including `horizontal-scope-by-ugrep.md`, carry `globs: []` and never auto-load. The directory holds 26 `.md` files; `README.md` and `_candidates.md` have no `globs:` line. `rules/conventions/DOCUMENTS.md:20` defines `docs/wiki/` as "Implementer-facing current state: repeated procedures and conventions". | `sed -n '2p'` over `docs/wiki/*.md`; `rules/conventions/DOCUMENTS.md:6,20` | Answers Q3 — a `globs: ["**/hooks/**/*.py", "**/workflows/**/*.js"]` page auto-loads exactly where ast-grep would apply, which no `rules/` file can do without loading always. Feeds `/think`. |
| P3 | The naming slot is settled by convention: a CLI wrapper skill is `use-cli-<cli>`, so the file would be `skills/use-cli-ast-grep/SKILL.md` with H1 `# use-cli-ast-grep`. | `rules/conventions/SKILLS.md` § Naming, § H1 | Record only. |
| P3 | Grant `Bash(ast-grep *)`, not `Bash(sg *)`. Homebrew installs both names (`/opt/homebrew/bin/ast-grep` and `/opt/homebrew/bin/sg`); `sg` is a two-character token that over-matches in permission globs and is unsearchable in prose. | `which ast-grep sg` | Record only — a constraint on the wiring, not a finding about it. |
| P3 | Any wiring lands twice. `.ja/` is canonical and the English side mirrors in the same commit (ADR-0073, `rules/conventions/MIRROR.md`). `.ja/` currently mentions ugrep in 49 files and bfs in 43, and ast-grep in 0. | `rules/conventions/MIRROR.md`; `ugrep -r -l --hidden` counts over `.ja/` | Record only. |
| P3 | `codegraph` is disabled as an MCP server and reaches the model only as a CLI plus a `UserPromptSubmit` hook (`~/.local/share/mise/shims/codegraph prompt-hook`, `settings.json:362`). | `.claude/settings.local.json` (`disabledMcpjsonServers: ["codegraph"]`); `settings.json:362`; `docs/SPEC.md:93` | Record only — but the prompt-hook is a fifth wiring surface if ast-grep ever needs proactive triggering. |

## Available Data

| Type | Item | Note |
| ---- | ---- | ---- |
| Env | ast-grep 0.45.2, ugrep 7.8.4, bfs 4.1.4, codegraph 1.5.0 | All four installed and on PATH |
| Config | `settings.json` `permissions.allow` (46 entries) | `Bash(ugrep *)`, `Bash(bfs *)` present; ast-grep and codegraph absent |
| File | `agents/**/*.md` (30 files, 28 agents + 2 `_lib/`) | 26 grant `Bash(ugrep:*)` + `Bash(bfs:*)`; `resolver-build` grants bare `Bash`; `generator-snapshot` grants `Bash(python3:*)` |
| File | `skills/use-cli-codegraph/SKILL.md` | The template a `use-cli-ast-grep` skill would follow |
| File | `skills/research/references/tactics.md:9-11` | The enforcement surface that makes codegraph get used |
| File | `git show f2819b56^:rules/development/TOOLS.md` | The deleted selection table, recoverable verbatim from git |
| File | `docs/wiki/horizontal-scope-by-ugrep.md` | Existing distilled ugrep procedure, `globs: []` |
| Tech | `ast-grep run -p <pat> -r <fix>` / `ast-grep scan -c sgconfig.yml` / `ast-grep outline` | The three subcommands with no incumbent equivalent |
| Tech | oxlint, ruff (`ruff.toml:5`, 12 rule families), guardrails (oxc AST, Rust rules) | Incumbents for mechanical prohibition |
| Env | `/Users/thkt/GitHub/cli/guardrails` | No `CLAUDE.md`; carries `.codegraph/`; zero ast-grep references |

## Constraints

| Category | Constraint |
| -------- | ---------- |
| OUTCOME | Quality gates must sit in a deterministic layer an AI agent cannot bypass at its discretion. A tool documented only in a keyword-triggered skill is bypassable by not matching the keyword. |
| OUTCOME (Non-goal) | Distribution to other team members is not the aim. A wiring optimized for one operator is acceptable. |
| OUTCOME (Constraint) | Stay inside the Claude Code hook / skill / plugin spec. No fork, no patch. |
| Mirror | `.ja/` is canonical; the English side mirrors in the same commit (ADR-0073, `rules/conventions/MIRROR.md`). |
| Prior decision | ADR-0072 unified code search on ugrep/bfs. Its Reassessment Triggers do not cover structural rewrite, so ast-grep needs its own DR rather than an amendment. |
| Prior decision | Session `e4ed9b7a` (2026-04-13) rejected ast-grep for pattern extraction in favor of a Rust custom parser, and gated tool choice on first naming the pattern to extract. |
| Structural | Agent `tools:` frontmatter is a hard allowlist. 26 of 28 agents cannot reach ast-grep without an edit to each file. |
| Language | ast-grep parses no Markdown. Under `agents/ skills/ rules/ hooks/ workflows/ docs/ tests/` the counts are 280 `.md` against 162 files ast-grep can parse (76 `.py`, 65 `.js`, 17 `.ts`, 4 `.tsx`). |

## Disconfirmation Check

Phase 5 did not run (Intent is Feature planning). The central absence claim is "ast-grep is referenced nowhere in the harness". A single-tool zero result is suspect, so it was verified with two tools, with hidden files explicitly included, per `references/verification.md`.

```
$ cd /Users/thkt/.claude
$ ugrep -r -n -I --hidden 'ast-grep' agents skills rules hooks workflows docs tests settings.json CLAUDE.md
$ grep -rIn 'ast-grep' agents skills rules hooks workflows docs tests settings.json CLAUDE.md
$ ugrep -r -n -I --hidden 'ast-grep' .ja/
```

Both tools returned no lines. The `--hidden` flag matters: an earlier run of `ugrep -r 'ast-grep'` over `/Users/thkt/GitHub/cli/guardrails` returned 0 hits while `bfs` showed a populated `.claude/` directory in that repo, so the first result could not be read as absence until re-run with `--hidden` and cross-checked with `grep`.

One tool misuse was caught and corrected during Phase 4. `ugrep -r -c 'ugrep' rules/ | wc -l` reported 19, which reads as 19 matching files. `-c` prints a count line for every file scanned, including zeros, so the number was the file count of the directory. Re-run as `ugrep -r -l 'ugrep' rules/ | wc -l` it is 0, matching the earlier `-n` run that printed nothing. Every count in this report uses `-l`.

The three-permission-surface claim was verified by reading each surface directly rather than by search: the full `permissions` object was dumped from `settings.json` with `json.load`, every `^tools:` line was extracted from all 30 `agents/**/*.md`, and `allowed-tools:` was read from the two skills that reference codegraph.

The commit-hash sweep for `e1535a88` ran across 48 git repositories under `/Users/thkt/GitHub`, `/Users/thkt/.claude/worktrees`, and `/Users/thkt/.cache` with `git cat-file -t`, printing a scanned count so that "no output" could be distinguished from "loop never ran": `repos scanned: 48, matches: 0`.

## References

| Path | Description |
| ---- | ----------- |
| `/Users/thkt/.claude/docs/decisions/0072-discontinue-yomu-and-unify-code-search-on-ugrep.md` | The governing decision for code search; unified on ugrep/bfs, lists three Reassessment Triggers |
| `/Users/thkt/.claude/docs/decisions/0073-*` (via `rules/conventions/MIRROR.md`) | `.ja/` canonical mirror policy |
| `/Users/thkt/.claude/skills/use-cli-codegraph/SKILL.md` | The CLI-wrapper skill template |
| `/Users/thkt/.claude/skills/research/references/tactics.md` | Where codegraph's use is enforced rather than merely offered |
| `/Users/thkt/.claude/docs/wiki/horizontal-scope-by-ugrep.md` | Existing distilled ugrep procedure |
| `/Users/thkt/.claude/docs/SPEC.md:20-35` | System boundary table naming every external binary and its supplier |
| `/Users/thkt/GitHub/cli/guardrails/.claude/workspace/research/2026-08-11-hook-naming-ast-vs-oxlint-delegation.md` | Prior verdict on building an AST rule vs delegating to an existing linter |
| recall session `e4ed9b7a-db7e-4264-8430-263e7fbe9569` (2026-04-13) | The prior ast-grep evaluation and its rejection |
| `.claude/workspace/research/2026-03-23-fts5-cjk-search.md` | Prior-research scan hit, shared=1 against a 6-word slug (filename overlap on "search" only); no content carried forward |

## Coverage Notes

- Commit `e1535a88` is `unknown, requires` the repository that holds it. It resolves in none of 48 git repositories under `~/GitHub`, `~/.claude/worktrees`, or `~/.cache`, and `~/.claude/projects/` retains session directories for `~/GitHub/guardrails` and `~/GitHub/claude-guardrails`, neither of which exists on disk today. Closing it needs the moved or deleted repo, or a reflog from the machine that made the commit. The Q1-Q3 findings do not depend on it; session `e4ed9b7a` supplies a locatable prior decision covering the same ground.
- Why `rules/development/TOOLS.md` was deleted is `unknown, requires` confirmation from the user. `f2819b56`'s body describes a `.gitignore` and README cleanup and never mentions rules consolidation, and no DR in the 2026-05-25 to 2026-06-25 window records it. Whether the `rules/` slot is open or deliberately closed changes the Q3 answer, so it is a question for the user rather than an inference.
- Phase 4 deviation: an `explorer-feature` agent (`tool-inventory`) was spawned to inventory the four tools across `agents/ skills/ rules/ hooks/ workflows/ docs/ plugins/ tests/`, and its result did not arrive before synthesis. The skill requires waiting for it. Synthesis proceeded because every item asked of it was gathered directly here with two-tool cross-checks, which the agent's ugrep-only grant could not have matched. The one root it was asked to cover that the findings above omit is `plugins/`, and that gap is now closed: `ugrep -r -l -I --hidden 'ast-grep' plugins/` and `grep -rIl 'ast-grep' plugins/` both return 0 files, while 6 files under `plugins/` mention ugrep or bfs. The conversation transcript served as the Phase 4 scratch rather than a separate file.
- Tool disagreement: `ugrep -r -c` and `ugrep -r -l` gave contradictory counts over `rules/`. Resolved as `-c` printing zero-count lines; `-l` and `-n` agree at 0. Recorded in Disconfirmation Check.
- No unverified external claim. ast-grep's capabilities are quoted from `ast-grep --help` and `ast-grep run --help` on the installed 0.45.2 binary, not from the project website.
- Two premises supplied with the question were refuted rather than confirmed: cli-guardrails has no `CLAUDE.md` and no ast-grep reference, and the prior decision's recorded rationale is a preference for a Rust custom parser rather than YAGNI.
- Advisor: invoked. It flagged four gaps, all closed — the TOOLS.md deletion rationale was traced to `f2819b56`, `docs/wiki/horizontal-scope-by-ugrep.md` was read and priced as a placement option, `resolver-build`'s bare `Bash` grant was verified and the 26-agent claim qualified, and the commit sweep was re-run with a printed repo count. Its framing of Q3 as a three-surface pattern and of Q2 as YAML rule vs Rust rule is carried into the findings.

## Next Steps

| Intent | Next Command |
| ------ | ------------ |
| Feature planning | `/think` |
