# Research: issue-53-aiano-annotation-framework

Generated: 2026-05-08
Session: ce78ecae-6097-4a34-8e85-260e8b6e256a
Intent: Feature planning
Domain: General (the issue spans Data model + API + Infrastructure)
Prior research: none found

## Purpose

Investigate amici Issue #53 ("AIANO 応用の AI 補助アノテーション基盤を eval データセット作成に追加") to surface the gap between the proposed design and the current amici crate so a downstream `/think` can plan with accurate inputs. The issue proposes adding a Highlight-then-Generate annotation framework (`amici/src/eval/annotation.rs`) plus three new `eval_harness` subcommands (`annotate`, `annotation-stats`, `annotation-export`) to lower eval-set authoring cost.

## Key Findings

| Priority | Finding | Source | Next Action |
| -------- | ------- | ------ | ----------- |
| 1 | `EvalQuery.annotation: String` already exists as a free-form relevance-rationale note. The proposed `AnnotationEntry` / `BlockMode` types collide on the word "annotation" — same identifier, different concept. | `/Users/thkt/GitHub/cli/amici/src/eval/fixture.rs:34-35`; required field listed in `REQUIRED_QUERY_FIELDS` at `:132` and validated by `load_jsonl_records` at `:225-247` | Disambiguate naming in design phase — e.g. rename existing field to `relevance_note` (fixture-hash-bumping migration) or namespace the new module (`eval::annotation_session`, `AnnotationSession`) to keep them distinct | 
| 2 | `annotation-export` target is schema-mismatched. Issue says "convert annotation entries to `known_answers.jsonl` 形式". `known_answers.jsonl` is the 3-kind known-answer fixture set (`identity` / `reverse` / `single_doc` with corpus + queries) — NOT the production query corpus the annotator authors. | `/Users/thkt/GitHub/cli/amici/src/eval/fixture.rs:80-89` (`KnownAnswerSet`), `:60-67` (`KnownAnswerKind`); committed file at `/Users/thkt/GitHub/cli/amici/tests/fixtures/eval/known_answers.jsonl` (3 lines, one per kind) | Decide in `/think`: does export target `queries.jsonl` (production corpus authoring) or extend `known_answers.jsonl` with a 4th kind? Issue conflates the two. | 
| 3 | `ADR 0021` cited as the rationale for "rurico (mlx-rs + Ruri v3) ローカル default、external API は opt-in" does not exist anywhere. Verified across amici (max 0003), rurico (0001-0007), yomu (0001 only), sae (no docs/decisions/), guardrails (0001 only). Cross-method: `find` + per-repo `ls` + filename grep all returned zero. | `/Users/thkt/GitHub/cli/amici/docs/decisions/` (0001/0002/0003 only); `/Users/thkt/GitHub/cli/rurico/docs/decisions/` (0001-0007); `/Users/thkt/GitHub/cli/yomu/docs/adr/`; `find /Users/thkt/GitHub/cli -path '*decisions*' -name '*.md'` audit | Reconcile with issue author. The "external API opt-in" decision is load-bearing for the AI suggestion path — needs an actual ADR or in-issue justification before `/think` commits. | 
| 4 | arXiv:2602.04579 ("AIANO", 4 Feb 2026) is the load-bearing citation for the entire issue rationale (40% time reduction, +8.2% retrieval precision, NASA-TLX deltas). Date is post-cutoff (Jan 2026); content cannot be verified from primary source within this session. | issue body `## 動機` paragraph; cutoff stated in environment `Assistant knowledge cutoff is January 2026`; no transcript-side fetch performed | Verify via `use-cli-scout` / WebFetch before `/think` accepts the quoted figures as design constraints. Treat the figures as `unknown, requires WebFetch` for now. | 
| 5 | Fixture stats in issue ("140+ queries × 7 categories") are stale. Actual: 168 queries × 8 categories. The 8th category (`variant_notation`) was added with the FTS5 trigram fullwidth-Latin guard test. | `wc -l tests/fixtures/eval/queries.jsonl` → 168; `jq -r '.category'` → 8 unique values: comparative / conceptual / definitional / factoid / howto / listing / troubleshooting / variant_notation; ADR-0002 historical statement at `/Users/thkt/GitHub/cli/amici/docs/decisions/0002-evaluation-methodology.md:44` says "≥140 across 7 categories at ≥20 each"; FTS5 guard test at `/Users/thkt/GitHub/cli/amici/src/eval/pipeline.rs:560` references `q-variant-notation-*` queries | Update issue (or `/think` SOW) to current numbers. The `variant_notation` category increases the surface that any AI-assisted authoring must reason about (fullwidth Latin not folded by FTS5 trigram tokenizer). | 
| 6 | Required new infra not present in amici: no clap (kv-arg parsing throughout `eval_harness`), no TTY/TUI input lib (only stderr `Spinner` output), no Levenshtein / `strsim` crate. Existing harness is non-interactive and structured around `kvs: HashMap<String,String>`. | `/Users/thkt/GitHub/cli/amici/Cargo.toml:18-25` (deps: bytemuck/rand/rand_chacha/rurico/rusqlite/serde/serde_json/thiserror/tracing/tracing-subscriber); `/Users/thkt/GitHub/cli/amici/src/bin/eval_harness.rs:522-525` (kv-arg parser); `/Users/thkt/GitHub/cli/amici/src/cli/spinner.rs:19-28` (TTY-aware output, no stdin handling) | Add `dialoguer` or hand-rolled raw-mode TUI plus `strsim` (or vendored Levenshtein) when implementing. The "TTY annotation session" plank is non-trivial in this crate's current shape. | 
| 7 | `rurico::cosine()` is a private helper inside `embed/fixtures.rs`, not a public API. The issue's "automation bias = rurico embedder cosine" plank therefore requires either a rurico public-API change or amici-side reimpl over `Vec<f32>` returned by `Embed::embed_query`. | `/Users/thkt/.cargo/git/checkouts/rurico-56b5968ac08ee26f/42d0ca4/src/embed/fixtures.rs:213` (`fn cosine(a: &[f32], b: &[f32]) -> f32` — non-pub); `Embed` trait at `:271` exposes `embed_query` returning `Vec<f32>` and `EMBEDDING_DIMS = 768` at `:72` | Decide in `/think`: lift `rurico::cosine` to `pub` (rurico-side PR) or implement amici-local cosine over the existing `Embed::embed_query` output. Both are small; choice is one of charter (rurico = primitive, amici = governance). | 
| 8 | Charter creep risk. ADR-0001 framed amici as "shared model-loading + CLI utilities". ADR-0002 expanded scope to "end-to-end retrieval-quality governance" (eval-harness migration from rurico). Issue #53 expands scope further to "eval-dataset authoring tooling" (interactive annotation session, provenance store, deskilling-monitoring). | `/Users/thkt/GitHub/cli/amici/docs/decisions/0001-extract-shared-model-loading-and-cli-utilities-into-amici-crate.md:1-50`; ADR-0002 at `/Users/thkt/GitHub/cli/amici/docs/decisions/0002-evaluation-methodology.md:1-15`; issue #53 acceptance criteria propose new ADR (Annotation framework) | The issue's checklist already calls for a new ADR. `/think` should explicitly extend ADR-0002 `Reassessment Triggers` or supersede it; otherwise the harness module gradually carries an authoring tool that could justify a future `amici-eval-author` split crate. | 
| 9 | Existing eval pipeline already produces deterministic per-query outputs (`QueryResult.ranked_hits`, FNV-1a `fixture_hash`, Bootstrap CI seed=42, ChaCha8Rng for shuffle). The annotation framework can attach to this pipeline cleanly — provenance metadata fits the existing `BaselineSnapshot` envelope shape (versioned schema, `captured_with`, `kind`). | `BASELINE_SCHEMA_VERSION` at `src/eval/baseline.rs:45` (currently 1.2; ADR-0003 proposes 1.3 for `FirstSearchReplay`); `BaselineKind` enum at `:59-72`; `atomic_write` at `:187-204` for safe artifact emission | Treat `annotation_sessions.jsonl` (issue's proposed fixture) as a sibling artifact distinct from `baseline.json`. The existing JSONL fixture loaders (`fixture.rs::each_jsonl_line` at `:252`) are reusable; no new I/O abstraction needed. | 
| 10 | Phasing in the issue (Phase 1: Block + Highlight + provenance; Phase 2: bias / deskilling expose; Phase 3: ja fixture; Phase 4: A/B baselines) is well-decomposed but Phase 1 ACs already include `BlockMode`, `AnnotationEntry`, three subcommands, three Block-mode wiring tests, ADR draft, README update — exceeds PREFLIGHT thresholds (≥5 files, ≥3 features, ≥3 layers). | issue body `## フェーズ計画` and `## 受け入れ基準 (Phase 1 限定)` checklist (7 items) | `/think` should split Phase 1 into sub-PRs: (a) types + module skeleton + ADR; (b) `annotate` subcommand TTY shell; (c) `annotation-stats` + `annotation-export`. The issue's "Phase 1 限定" framing already acknowledges this is multi-PR territory. | 

## Available Data

| Type | Item | Note |
| ---- | ---- | ---- |
| File | `/Users/thkt/GitHub/cli/amici/src/eval/fixture.rs` | Existing `EvalQuery` / `EvalDocument` / `KnownAnswerKind` / `KnownAnswerFixture` types + JSONL loader/validator (FR-005..FR-007) |
| File | `/Users/thkt/GitHub/cli/amici/src/eval.rs` | Module root — `pub mod baseline; pub mod fixture; pub mod metrics; pub mod oracle_gap; pub mod oracle_pipeline; pub mod pipeline;`. New `pub mod annotation;` slots in here. |
| File | `/Users/thkt/GitHub/cli/amici/src/bin/eval_harness.rs` | 1659-line harness binary; `main()` dispatch at `:508-540`; `MLX_DEPENDENT_MODES` const at `:500` would need `annotate`/`annotation-stats`/`annotation-export` classification |
| File | `/Users/thkt/GitHub/cli/amici/src/eval/baseline.rs` | `BaselineKind` (Forward/Reverse/Oracle), schema-version envelope, `atomic_write`. Annotation provenance can borrow this envelope shape. |
| File | `/Users/thkt/GitHub/cli/amici/src/eval/pipeline.rs` | `Embed`/`Rerank` composition, `QueryResult`, `MergedHit`. The annotation framework reads this to surface "current ranking for this query" while annotating. |
| File | `/Users/thkt/GitHub/cli/amici/tests/fixtures/eval/queries.jsonl` | 168 queries, 8 categories, ground-truth corpus the annotator extends. |
| File | `/Users/thkt/GitHub/cli/amici/tests/fixtures/eval/known_answers.jsonl` | 3 lines: identity / reverse / single_doc kinds. NOT a single-corpus file — design conflation point per Finding #2. |
| File | `/Users/thkt/GitHub/cli/amici/justfile` | Shows the `eval-*` recipe convention (capture-baseline, capture-oracle, oracle-gap, evaluate, verify-baseline). New `eval-annotate` etc. should follow this shape. |
| Tech | `Cargo.toml` deps | rurico (HEAD `42d0ca4`), rusqlite (bundled), serde/serde_json, thiserror, tracing(+subscriber), bytemuck, rand/rand_chacha. **No clap, no anyhow, no dialoguer, no strsim/edit-distance.** |
| Tech | rurico `Embed` trait | Public API: `embed_query(&self, &str) -> Result<Vec<f32>, EmbedError>`, `embed_documents_batch`, `embed_text` with prefix. `EMBEDDING_DIMS = 768`. Cosine helper is private. |
| Convention | Subcommand argv | kv-arg parser at `eval_harness.rs:522-525`. Required keys (`output=`, `baseline=`, `oracle=`) cause `EXIT_USAGE`. Three exit codes: `EXIT_REGRESSION=1`, `EXIT_USAGE=2`, `EXIT_INFRA=3`. |
| Convention | Test layout | T-NNN comment per test, `#[ignore]` for MLX-required, `#[cfg(feature = "eval-harness")]` for harness-binary smoke. Module `tests.rs` split when long. |
| Convention | Rust module style | `sub.rs` + `sub/child.rs` (no `mod.rs`); `pub(super)` over `pub(crate)` over `pub`; thiserror `#[non_exhaustive]` on pub error enums. |
| Env | MLX/Metal | Apple Silicon-only model load; harness binary feature-gated via `eval-harness`; default `cargo test` skips it. New annotation subcommands likely don't need MLX *unless* `Collaborative` mode invokes the embedder for AI suggestions — in which case MLX dependency must be tracked in `MLX_DEPENDENT_MODES`. |

## Constraints

| Category | Constraint |
| -------- | ---------- |
| Compatibility | Bumping `BASELINE_SCHEMA_VERSION` (currently 1.2) invalidates committed `baseline.json` / `oracle_baseline.json`. The annotation framework should not bump this version; it should ship its own `ANNOTATION_SCHEMA_VERSION` envelope per ADR-0002 §"baseline.json carries ... so drift drivers are explicit". |
| Reproducibility | ADR-0002 §3 (Statistical contract): all metrics carry Bootstrap CI n=1000 seed=42 over 7-category ≥20-query distribution. Any annotation-driven fixture extension must keep `validate_category_distribution` (FR-006) passing — adding an 8th-or-9th category requires a documented decision. |
| Security/Privacy | ADR-0002 §"Fixture corpus": "openly licensed material". Annotator-typed text becomes part of `queries.jsonl` if exported; license + provenance fields (`source: "Synthetic test fixture"`-style) must be retained. |
| Determinism | `BaselineSnapshot.captured_with`, `timestamp`, `model_id`, `model_revision`, `mlx_rs_version`, `fixture_hash` are mandatory provenance fields. Annotation-time provenance (`annotator_id`, session start, edit count) belongs in a parallel envelope. |
| Charter | ADR-0001 + ADR-0002: amici hosts retrieval-quality governance for sae/yomu/recall consumers. Issue #53 expands amici to dataset *authoring*; flag as ADR-0002 reassessment trigger. |
| Verifiability | Issue cites arXiv:2602.04579 (post-cutoff) and ADR-0021 (does not exist). Both require external verification before becoming design constraints. |

## Disconfirmation Check

Phase 3 was skipped (intent = Feature planning, not Bug investigation). Disconfirmation evidence quoted from Phase 2 audit-trail scratch:

Command: `find /Users/thkt/GitHub/cli -path "*decisions*" -name "*.md" 2>/dev/null`

Raw output below.

```
/Users/thkt/GitHub/cli/amici/docs/decisions/0002-evaluation-methodology.md
/Users/thkt/GitHub/cli/amici/docs/decisions/README.md
/Users/thkt/GitHub/cli/amici/docs/decisions/0003-add-pgr-style-first-search-offline-retrieval-benchmark.md
/Users/thkt/GitHub/cli/amici/docs/decisions/0001-extract-shared-model-loading-and-cli-utilities-into-amici-crate.md
/Users/thkt/GitHub/cli/rurico/docs/decisions/0004-retrieval-and-rerank-pipeline-contract-for-rurico.md
/Users/thkt/GitHub/cli/rurico/docs/decisions/0006-eval-harness-migration-to-amici.md
/Users/thkt/GitHub/cli/rurico/docs/decisions/0007-library-logging-boundary.md
/Users/thkt/GitHub/cli/rurico/docs/decisions/README.md
/Users/thkt/GitHub/cli/rurico/docs/decisions/0005-prefix-ensemble-experiment-not-adopted.md
/Users/thkt/GitHub/cli/rurico/docs/decisions/0001-typed-fts-query-contract.md
/Users/thkt/GitHub/cli/rurico/docs/decisions/0003-evaluation-methodology.md
/Users/thkt/GitHub/cli/rurico/docs/decisions/0002-gpu-side-pooling-embed.md
/Users/thkt/GitHub/cli/guardrails/docs/decisions/README.md
/Users/thkt/GitHub/cli/guardrails/docs/decisions/0001-adopt-installsh-prefetch-for-oxlint-provisioning.md
```

Result: No `0021-*.md` anywhere. Cross-checked with `find /Users/thkt/GitHub/cli -name "0021*"` (returned only target/debug build artifacts) and per-repo `ls docs/decisions/` (yomu uses `docs/adr/` instead, max ADR is 0001). Issue #53's "ADR 0021" reference is unverifiable — author likely confused with another repo's numbering or a future ADR.

Command: `grep -rn "Levenshtein\|edit_distance" /Users/thkt/GitHub/cli/amici --include="*.rs" --include="*.toml"`

Raw output below.

```
(no matches)
```

Result: No edit-distance code or dep in amici. Cross-checked with `grep` over `Cargo.toml` (no `strsim`/`levenshtein`/`distance`) and over `src/` (no in-tree implementation). Implementation will need to vendor or add a dep.

Command: `grep -rn "embed_query\|embed_documents_batch\|EMBEDDING_DIMS\|cosine" /Users/thkt/.cargo/git/checkouts/rurico-56b5968ac08ee26f/42d0ca4/src/embed.rs /Users/thkt/.cargo/git/checkouts/rurico-56b5968ac08ee26f/42d0ca4/src/embed/fixtures.rs`

Raw output (truncated; relevant lines only):

```
/Users/thkt/.cargo/git/checkouts/rurico-56b5968ac08ee26f/42d0ca4/src/embed.rs:72:pub const EMBEDDING_DIMS: usize = 768;
/Users/thkt/.cargo/git/checkouts/rurico-56b5968ac08ee26f/42d0ca4/src/embed.rs:280:    fn embed_query(&self, text: &str) -> Result<Vec<f32>, EmbedError>;
/Users/thkt/.cargo/git/checkouts/rurico-56b5968ac08ee26f/42d0ca4/src/embed.rs:299:    fn embed_documents_batch(&self, texts: &[&str]) -> Result<Vec<ChunkedEmbedding>, EmbedError> {
/Users/thkt/.cargo/git/checkouts/rurico-56b5968ac08ee26f/42d0ca4/src/embed/fixtures.rs:213:fn cosine(a: &[f32], b: &[f32]) -> f32 {
```

Result: `Embed::embed_query` returns `Vec<f32>` (public); `cosine` is a private helper in fixtures (no `pub` keyword). Cross-checked with `grep -rn "pub fn cosine\|pub use.*cosine"` (no public re-export). Issue's "rurico embedder cosine" plank requires either a rurico public-API addition or amici-side reimplementation — both small but a deliberate decision.

## References

| Path | Description |
| ---- | ----------- |
| `https://github.com/thkt/amici/issues/53` | The issue under research |
| `/Users/thkt/GitHub/cli/amici/docs/decisions/0001-extract-shared-model-loading-and-cli-utilities-into-amici-crate.md` | Charter: amici = "shared model-loading + CLI utilities" |
| `/Users/thkt/GitHub/cli/amici/docs/decisions/0002-evaluation-methodology.md` | Charter expansion: "end-to-end retrieval-quality governance"; defines `baseline.json` envelope, statistical contract, fixture rules |
| `/Users/thkt/GitHub/cli/amici/docs/decisions/0003-add-pgr-style-first-search-offline-retrieval-benchmark.md` | Most recent ADR; demonstrates the "add a new metric + subcommand" pattern issue #53 should follow for surface symmetry |
| `/Users/thkt/GitHub/cli/amici/src/eval/fixture.rs` | Existing fixture types and `annotation: String` field collision point |
| `/Users/thkt/GitHub/cli/amici/src/bin/eval_harness.rs` | Existing kv-arg parser, exit codes, MLX-mode classification |
| `/Users/thkt/GitHub/cli/amici/src/eval/baseline.rs` | Schema-versioning + atomic write pattern annotation provenance can mirror |
| `/Users/thkt/GitHub/cli/amici/src/eval/oracle_gap.rs` | Most recent example of a new eval module with typed errors, schema-version checks, and markdown report generation — closest template for `annotation-stats` |
| `/Users/thkt/GitHub/cli/amici/justfile` | `eval-*` recipe convention to follow for new annotation recipes |
| `arXiv:2602.04579` | "AIANO" paper cited by issue rationale; **post-cutoff (Feb 2026), unverified** |
| `https://github.com/thkt/amici/issues/52` | Closed (Oracle pipeline) — issue #53 mentions as "互いに独立、Phase 1 完了後に判断" but oracle and annotation share the schema-versioning envelope pattern |
| `https://github.com/thkt/amici/issues/61` / `#62` | Open siblings (Hit@k metric + first-search replay) — both touch `BaselineKind` / `MetricSpec` enums; coordinate enum bumps if landing in parallel |

## Coverage Notes

- ADR-0021 (cited in issue): unverifiable in the local checkout set. Resolve by asking issue author to point at the actual decision record or fold the rationale into the new annotation ADR the issue's checklist already requires.
- arXiv:2602.04579 (cited in issue): post-cutoff. Verify via `use-cli-scout` / WebFetch in the next session. Until then, treat the quoted figures (40% time delta, +8.2% retrieval precision, NASA-TLX ratings) as motivational rather than load-bearing.
- "TTY annotation session" infrastructure: amici has no interactive-input infra today. The choice between `dialoguer`, hand-rolled stdin/`crossterm`, and a TUI lib is a `/think` decision; current research only confirms absence.
- Tool agreement (Phase 2 cross-method): `find` and per-repo `ls` both confirmed ADR-0021 absence; `grep -rn` and `Cargo.toml` inspection both confirmed Levenshtein absence; rurico `cosine` privacy verified by source-line inspection plus `grep "pub fn cosine\|pub use.*cosine"`. No tool disagreement detected.
- Advisor (Phase 4): Invoked. Surfaced 5 reconciliation gaps (ADR-0021 absence, arXiv post-cutoff, fixture-stat staleness, schema collision on `annotation`, `known_answers.jsonl` schema mismatch, rurico cosine privacy, charter creep) — all incorporated into Key Findings #1-#8 above and Constraints. Advisor explicitly directed not to extend Phase 2.
- Phase 1 question coverage: Intent (Feature planning) and Domain (General) inferred from issue body without AskUserQuestion — issue presents a concrete design proposal with explicit module/file targets, so no additional clarification was needed.

## Next Steps

| Intent | Next Command |
| ------ | ------------ |
| Feature planning | `/think` — pass this research file as input. Recommended SOW outline: (1) reconcile ADR-0021 + arXiv references with issue author; (2) name-disambiguation decision (existing `EvalQuery.annotation` vs proposed `AnnotationEntry`); (3) export-target decision (`queries.jsonl` vs `known_answers.jsonl` 4th kind); (4) rurico-cosine surfacing decision (rurico PR vs amici-local); (5) split issue's Phase 1 ACs into 3 sub-PRs along the seams identified in Finding #10; (6) draft new ADR-0004 (Annotation framework) extending ADR-0002 reassessment triggers. |

Recommended module location: `amici/src/eval/annotation.rs` + `amici/src/eval/annotation/tests.rs` (mirror oracle_pipeline pattern). Recommended subcommand triple: `annotate` (MLX-dependent if `Collaborative` mode invokes embedder), `annotation-stats` (read-only, runs in seatbelt), `annotation-export` (read-only). Recommended fixture file: `tests/fixtures/eval/annotation_sessions.jsonl` (sibling, not replacement, of existing fixtures).
