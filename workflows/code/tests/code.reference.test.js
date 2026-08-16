// One reader agent reads the conventions index (docs/REFERENCE_INDEX.md) before the unit loop,
// and the script matches its table by glob and injects the result into the implementation step's
// prompt. The injected block carries delimiters and states that the index body is data rather
// than instructions, plus the rule that on a conflict the later line wins. Glob precision (the
// `/` boundary of `**` and `*`, and so on) is verified by the matching cases further down, so
// these first cases check the minimum with simple exact-name glob rows. The injected wording is
// localized per EN / JA (EN "Read before implementing:" / JA "実装前に読む:"), so only the
// expected strings in the assertions follow the EN version and everything else stays identical
// to the .ja side.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const codeJs = join(here, "..", "..", "code.js");

// An index row is a table of "target glob, one-line description, reference path". One glob row
// matching sample.js, and one row with no glob (always offered as a judgment candidate).
const INDEX_TABLE =
  "| glob | description | path |\n" +
  "| --- | --- | --- |\n" +
  "| sample.js | naming conventions for JS | docs/conventions/js-naming.md |\n" +
  "| - | error handling format; read it at your discretion | docs/conventions/error-handling.md |\n";

const foundIndex = { found: true, table: INDEX_TABLE };
const noIndex = { found: false, table: "" };

// A one-unit plan taking direct implementation (no tests). It reaches the impl step's prompt by
// the shortest path.
const implPlan = (files) => ({
  test_command: "echo test",
  units: [
    {
      id: "U-1",
      goal: "docs goal",
      files,
      contract: "docs contract",
      tests: [],
      seam: false,
    },
  ],
});

// A one-unit plan carrying tests. The red step ends twice with red_confirmed: false and never
// advances to green (the no-red route). Only the red step's prompt is under observation, so no
// green stub is provided.
const redPlan = (files) => ({
  test_command: "echo test",
  units: [
    {
      id: "U-1",
      goal: "impl goal",
      files,
      contract: "impl contract",
      tests: [{ id: "T-100", name: "sample spec statement" }],
      seam: false,
    },
  ],
});

// A label-covering stub where only the reference-index return value varies. An unknown label
// throws, the same shape as code.degradation.test.js.
const stubWith = (indexResult) => (prompt, opts) => {
  const label = opts.label ?? "";
  if (label === "reference-index") return indexResult;
  if (label.startsWith("impl:")) return { green: true, notes: "", deferred: [] };
  if (label.startsWith("red:") || label.startsWith("red2:"))
    return { red_confirmed: false, test_files: [], notes: "already implemented" };
  if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
  throw new Error(`unexpected label: ${label}`);
};

const promptFor = (calls, label) => {
  const call = calls.agent.find((c) => (c.opts.label ?? "") === label);
  assert.ok(call, `the ${label} agent ran`);
  return call.prompt;
};

// The verbatim impl:U-1 prompt the current code.js (before the reference-index feature) emits.
// On 2026-07-28, runWorkflow(codeJs, {args:{plan: implPlan(["sample.js"]), repo:""}}) was run
// against the pre-feature (main) workflows/code.js and the impl:U-1 prompt was captured (the
// tool result of that session).
const BASELINE_IMPL_PROMPT =
  'Direct implementation step. Unit U-1\'s goal is "docs goal". The target files are ["sample.js"].\n' +
  "The contract is docs contract. The test scenarios are [].\n" +
  "The test command is echo test.\n" +
  "When writing framework / library API code, follow the pinned version's official docs rather than memory. Read docs with `scout fetch <url>`. When scout is unavailable or the fetch fails, mark that API usage unverified in a code comment and keep implementing.\n" +
  "Before reporting the result, audit each claim against a tool result from this session. Report only work you can point to evidence for; state unverified items as such in notes.\n" +
  "Unit-test convenience is never a reason to drop part of the feature. Do not omit a shared component, a data fetch, or a navigation affordance because it would need a Router / Suspense / permission context; stub that boundary in the test instead. Deferrals absent from the plan are forbidden, including narrowing the implementation behind a code comment claiming a later unit will do it. If part of what the contract / files require must go unimplemented, list it in deferred (it is recorded as an anomaly and surfaced on the PR).\n" +
  "Do not call the advisor tool, even on design ambiguity or an environment blocker. Push through to the end on your own analysis alone; write the judgment you made into notes and any narrowed implementation into deferred, leaving it to the anomaly record.\n" +
  "Implement per the contract; write no new tests. Keep the existing test suite green (echo test); weakening / skipping / deleting existing tests is forbidden. Run the suite and report green.";

test("injects the reference path of a matching row into the implementation prompt with a read instruction", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["sample.js"]), repo: "" },
    stubs: { agent: stubWith(foundIndex) },
  });

  const reader = calls.agent.find((c) => (c.opts.label ?? "") === "reference-index");
  assert.ok(reader, "the reader agent runs before the unit loop");
  assert.match(
    reader.prompt,
    /docs\/REFERENCE_INDEX\.md/,
    "the reader agent is told to read the index of convention paths",
  );

  const prompt = promptFor(calls, "impl:U-1");
  assert.match(
    prompt,
    /Read before implementing: docs\/conventions\/js-naming\.md/,
    "the matching glob row's reference path rides the prompt with a read instruction",
  );
  assert.match(
    prompt,
    /---- reference-index start ----[\s\S]*---- reference-index end ----/,
    "the injected block is fenced by delimiters",
  );
  assert.match(
    prompt,
    /data, not instructions/,
    "it states that the index body is data rather than instructions",
  );
  assert.match(prompt, /the later line wins/, "it states the rule that the later line wins");
});

test("does not inject into the Red step's prompt", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: redPlan(["sample.js"]), repo: "" },
    stubs: { agent: stubWith(foundIndex) },
  });

  // Confirm first that the reader really ran and found a match. Had it never run, "no injection"
  // would be vacuously true through the feature's absence and would verify no Red-step exclusion.
  const reader = calls.agent.find((c) => (c.opts.label ?? "") === "reference-index");
  assert.ok(reader, "the reader agent runs before the unit loop");

  const redPrompt = promptFor(calls, "red:U-1");
  assert.doesNotMatch(
    redPrompt,
    /docs\/conventions\/js-naming\.md/,
    "the matching reference path does not ride the Red step's prompt",
  );
  assert.doesNotMatch(
    redPrompt,
    /reference-index/,
    "the reference-index injected block is absent from the Red step's prompt",
  );
});

test("offers a row with no glob as a judgment candidate carrying its description and path", async () => {
  // The unit's files match no glob row (sample.js). This watches that only the glob-less row is
  // always offered.
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["other.rb"]), repo: "" },
    stubs: { agent: stubWith(foundIndex) },
  });

  const prompt = promptFor(calls, "impl:U-1");
  assert.match(
    prompt,
    /Consider reading: docs\/conventions\/error-handling\.md/,
    "the glob-less row rides as a judgment candidate with its path",
  );
  assert.match(
    prompt,
    /error handling format/,
    "the glob-less row's one-line description rides as a judgment candidate too",
  );
  assert.doesNotMatch(
    prompt,
    /docs\/conventions\/js-naming\.md/,
    "a glob row not matching the unit's files does not ride",
  );
});

test("folds several matching glob rows pointing at one reference path into a single read instruction", async () => {
  // The glob subset carries no brace expansion, so N globs to 1 doc is unavoidable when the doc
  // is coarser than the source kind.
  const table =
    "| glob | description | path |\n" +
    "| --- | --- | --- |\n" +
    "| **/agents/**/*.md | how to write an agent definition | docs/SKILLS_AGENTS.md |\n" +
    "| **/skills/**/SKILL.md | the design intent of a skill | docs/SKILLS_AGENTS.md |\n";

  const { calls } = await runWorkflow(codeJs, {
    args: {
      plan: implPlan(["agents/reviewer-security.md", "skills/stock/SKILL.md"]),
      repo: "",
    },
    stubs: { agent: stubWith({ found: true, table }) },
  });

  const prompt = promptFor(calls, "impl:U-1");
  const occurrences = prompt.split("Read before implementing: docs/SKILLS_AGENTS.md").length - 1;
  assert.equal(
    occurrences,
    1,
    "both glob rows matching still folds the read instruction for that path into one line",
  );
});

test("keeps a read instruction and a judgment candidate for the same path separate", async () => {
  // Folding across the two would drop either the candidate's description or the read
  // instruction's must-read force.
  const table =
    "| glob | description | path |\n" +
    "| --- | --- | --- |\n" +
    "| - | read it at your discretion | docs/SKILLS_AGENTS.md |\n" +
    "| **/skills/**/SKILL.md | the design intent of a skill | docs/SKILLS_AGENTS.md |\n";

  const { calls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["skills/stock/SKILL.md"]), repo: "" },
    stubs: { agent: stubWith({ found: true, table }) },
  });

  const prompt = promptFor(calls, "impl:U-1");
  assert.match(
    prompt,
    /Consider reading: docs\/SKILLS_AGENTS\.md \(read it at your discretion\)/,
    "the judgment candidate keeps its description",
  );
  assert.match(
    prompt,
    /Read before implementing: docs\/SKILLS_AGENTS\.md/,
    "the read instruction rides separately even for the same path",
  );
});

test("orders the injection with the general (judgment candidate) first and the specific (read instruction) after", async () => {
  // Paired with the "later line wins" rule, placing the read instruction last makes it win over
  // the judgment candidate.
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["sample.js"]), repo: "" },
    stubs: { agent: stubWith(foundIndex) },
  });

  const prompt = promptFor(calls, "impl:U-1");
  const candidateAt = prompt.indexOf("Consider reading: docs/conventions/error-handling.md");
  const mandatoryAt = prompt.indexOf("Read before implementing: docs/conventions/js-naming.md");
  assert.ok(candidateAt >= 0, "the judgment candidate line rides");
  assert.ok(mandatoryAt >= 0, "the read instruction line rides");
  assert.ok(
    candidateAt < mandatoryAt,
    "the judgment candidate (general) sits before the read instruction (specific)",
  );
});

// Exact names alone cannot match a practical glob row carrying `**/` and `*` against a real file
// path. The cases below verify the matching rules of the glob subset (`**/` matches zero levels
// too, `*` does not cross `/`), the leading `./` and `/` normalization on both sides, and that a
// row carrying an unsupported metacharacter is recorded as an anomaly rather than silently
// ignored.

test("a `docs/**/*.md` glob matches an md both directly under docs and one level below", async () => {
  const table =
    "| glob | description | path |\n" +
    "| --- | --- | --- |\n" +
    "| docs/**/*.md | documentation conventions | docs/conventions/docs-naming.md |\n";
  const index = { found: true, table };

  const { calls: rootCalls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["docs/readme.md"]), repo: "" },
    stubs: { agent: stubWith(index) },
  });
  assert.match(
    promptFor(rootCalls, "impl:U-1"),
    /Read before implementing: docs\/conventions\/docs-naming\.md/,
    "an md directly under docs (zero levels) matches the `**` glob row",
  );

  const { calls: nestedCalls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["docs/sub/readme.md"]), repo: "" },
    stubs: { agent: stubWith(index) },
  });
  assert.match(
    promptFor(nestedCalls, "impl:U-1"),
    /Read before implementing: docs\/conventions\/docs-naming\.md/,
    "an md one level below docs matches the same glob row",
  );
});

test("a `src/*.tsx` glob does not match `src/app/page.tsx`", async () => {
  const table =
    "| glob | description | path |\n" +
    "| --- | --- | --- |\n" +
    "| src/*.tsx | component conventions | docs/conventions/component-tsx.md |\n";
  const index = { found: true, table };

  const { calls: shallowCalls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["src/button.tsx"]), repo: "" },
    stubs: { agent: stubWith(index) },
  });
  assert.match(
    promptFor(shallowCalls, "impl:U-1"),
    /Read before implementing: docs\/conventions\/component-tsx\.md/,
    "a tsx directly under src matches the `*.tsx` glob row",
  );

  const { calls: nestedCalls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["src/app/page.tsx"]), repo: "" },
    stubs: { agent: stubWith(index) },
  });
  assert.doesNotMatch(
    promptFor(nestedCalls, "impl:U-1"),
    /docs\/conventions\/component-tsx\.md/,
    "`*` does not cross `/`, so a tsx one level below does not match the glob row",
  );
});

test("normalizes a path carrying a leading `./` or `/` before matching", async () => {
  const table =
    "| glob | description | path |\n" +
    "| --- | --- | --- |\n" +
    "| src/button.tsx | button conventions | docs/conventions/button.md |\n";
  const index = { found: true, table };

  const { calls: dotSlashFileCalls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["./src/button.tsx"]), repo: "" },
    stubs: { agent: stubWith(index) },
  });
  assert.match(
    promptFor(dotSlashFileCalls, "impl:U-1"),
    /Read before implementing: docs\/conventions\/button\.md/,
    "a file path carrying a leading `./` matches the glob row after normalization",
  );

  const tableLeadingSlash =
    "| glob | description | path |\n" +
    "| --- | --- | --- |\n" +
    "| /src/button.tsx | button conventions | docs/conventions/button.md |\n";
  const indexLeadingSlash = { found: true, table: tableLeadingSlash };

  const { calls: leadingSlashGlobCalls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["src/button.tsx"]), repo: "" },
    stubs: { agent: stubWith(indexLeadingSlash) },
  });
  assert.match(
    promptFor(leadingSlashGlobCalls, "impl:U-1"),
    /Read before implementing: docs\/conventions\/button\.md/,
    "a glob row carrying a leading `/` matches the file path after normalization",
  );
});

test("drops a row carrying an unsupported metacharacter from matching and records it as an anomaly", async () => {
  const table =
    "| glob | description | path |\n" +
    "| --- | --- | --- |\n" +
    "| src/file?.js | a row carrying an unsupported metacharacter | docs/conventions/unsupported.md |\n";
  const index = { found: true, table };

  const { calls, result } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["src/file1.js"]), repo: "" },
    stubs: { agent: stubWith(index) },
  });

  assert.doesNotMatch(
    promptFor(calls, "impl:U-1"),
    /docs\/conventions\/unsupported\.md/,
    "a glob row carrying an unsupported metacharacter (`?`) drops from matching and is not injected",
  );
  assert.ok(
    result.anomalies.some(
      (a) => a.kind === "unsupported-glob" && String(a.notes).includes("src/file?.js"),
    ),
    "a row carrying an unsupported metacharacter is recorded as an anomaly of kind unsupported-glob",
  );
});

test("drops a row carrying a bare `**` not followed by `/` from matching and records it as an anomaly", async () => {
  // `src/**` clears the character-set check, but tokenization recognizes only `**/` and `*` and
  // splits it into two `*`, turning it into a single-segment match. Rather than a silent false
  // negative, it is recorded as unsupported.
  const table =
    "| glob | description | path |\n" +
    "| --- | --- | --- |\n" +
    "| src/** | a row carrying a bare `**` | docs/conventions/bare-doublestar.md |\n";
  const index = { found: true, table };

  const { calls, result } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["src/a/b.js"]), repo: "" },
    stubs: { agent: stubWith(index) },
  });

  assert.doesNotMatch(
    promptFor(calls, "impl:U-1"),
    /docs\/conventions\/bare-doublestar\.md/,
    "a glob row carrying a bare `**` drops from matching and is not injected",
  );
  assert.ok(
    result.anomalies.some(
      (a) => a.kind === "unsupported-glob" && String(a.notes).includes("src/**"),
    ),
    "a row carrying a bare `**` is recorded as an anomaly of kind unsupported-glob",
  );
});

// End-to-end connection checks. Each feature is green on its own, but whether the reader is
// called exactly once across several units, and whether the anomaly shape is uniform at every
// push site, went unverified. These carry a two-unit plan through the real runWorkflow and check
// the reader call count and the structural consistency of the anomalies.

// A plan whose two units both take direct implementation (no tests). It watches only the reader
// call count and the injection into both units' prompts.
const twoUnitImplPlan = (filesA, filesB) => ({
  test_command: "echo test",
  units: [
    { id: "U-1", goal: "goal a", files: filesA, contract: "contract a", tests: [], seam: false },
    { id: "U-2", goal: "goal b", files: filesB, contract: "contract b", tests: [], seam: false },
  ],
});

test("an end-to-end two-unit plan with an index calls the reader once and injects the reference into both implementation prompts", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: twoUnitImplPlan(["sample.js"], ["sample.js"]), repo: "" },
    stubs: { agent: stubWith(foundIndex) },
  });

  const readerCalls = calls.agent.filter((c) => (c.opts.label ?? "") === "reference-index");
  assert.equal(readerCalls.length, 1, "the reader agent runs once even on a two-unit plan");

  assert.match(
    promptFor(calls, "impl:U-1"),
    /Read before implementing: docs\/conventions\/js-naming\.md/,
    "the first unit's implementation prompt carries the matching reference",
  );
  assert.match(
    promptFor(calls, "impl:U-2"),
    /Read before implementing: docs\/conventions\/js-naming\.md/,
    "the second unit's implementation prompt carries the same reference",
  );
});

// A plan raising all three anomaly kinds in one run: no-red (U-1), scope-cut (U-2), and
// unsupported-glob (after the reader read, before the unit loop).
const anomalyPlan = () => ({
  test_command: "echo test",
  units: [
    {
      id: "U-1",
      goal: "impl goal",
      files: ["a.js"],
      contract: "c1",
      tests: [{ id: "T-1", name: "already implemented" }],
      seam: false,
    },
    { id: "U-2", goal: "impl goal 2", files: ["b.js"], contract: "c2", tests: [], seam: false },
  ],
});

const unsupportedGlobTable =
  "| glob | description | path |\n" +
  "| --- | --- | --- |\n" +
  "| src/file?.js | a row carrying an unsupported metacharacter | docs/conventions/unsupported.md |\n";
const unsupportedGlobIndex = { found: true, table: unsupportedGlobTable };

const stubForAnomalies = (prompt, opts) => {
  const label = opts.label ?? "";
  if (label === "reference-index") return unsupportedGlobIndex;
  if (label.startsWith("impl:"))
    return { green: true, notes: "", deferred: ["partial implementation"] };
  if (label.startsWith("red:") || label.startsWith("red2:"))
    return { red_confirmed: false, test_files: [], notes: "already implemented" };
  if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
  throw new Error(`unexpected label: ${label}`);
};

test("every element of anomalies carries unit, kind, and notes", async () => {
  const { result } = await runWorkflow(codeJs, {
    args: { plan: anomalyPlan(), repo: "" },
    stubs: { agent: stubForAnomalies },
  });

  assert.ok(
    result.anomalies.length >= 3,
    "all three anomaly kinds no-red, scope-cut, and unsupported-glob are recorded",
  );
  for (const anomaly of result.anomalies) {
    assert.equal(typeof anomaly.unit, "string", `the anomaly (${anomaly.kind}) carries a unit`);
    assert.ok(anomaly.unit.length > 0, `the anomaly (${anomaly.kind}) unit is not an empty string`);
    assert.equal(typeof anomaly.kind, "string", "the anomaly carries a kind");
    assert.equal(typeof anomaly.notes, "string", "the anomaly carries notes");
  }
});

test("leaves the implementation prompt unchanged when the index is absent", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["sample.js"]), repo: "" },
    stubs: { agent: stubWith(noIndex) },
  });

  // The reader agent itself still runs before the unit loop when the index is absent. Had it
  // never run, "the prompt is unchanged" would be vacuously true through the feature's absence
  // and would verify no fail-open.
  const reader = calls.agent.find((c) => (c.opts.label ?? "") === "reference-index");
  assert.ok(reader, "the reader agent runs before the unit loop even with the index absent");
  assert.match(
    reader.prompt,
    /docs\/REFERENCE_INDEX\.md/,
    "the reader agent is told to read the index of convention paths",
  );

  const prompt = promptFor(calls, "impl:U-1");
  assert.equal(
    prompt,
    BASELINE_IMPL_PROMPT,
    "with the index absent the impl prompt matches the current verbatim text and no injection happens",
  );
});
