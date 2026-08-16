// check-index.js and workflows/code.js hold the same glob rules as two copies. A copy can drift
// when either is revised, so a shared fixture table feeds both the same input and these cases
// watch that their decisions agree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../../workflows/_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const scriptPath = join(root, "skills", "stock", "scripts", "check-index.js");
const codeJs = join(root, "workflows", "code.js");

// The reference path plays no part in the decision, so it stays fixed.
const REF_PATH = "docs/ref.md";

// The rows cover an exact match, `**/` at zero and one level, the boundary where `*` does not
// cross `/`, the leading `./` and `/` normalization, an unsupported metacharacter, a bare `**`,
// and a mismatched extension.
const FIXTURE = [
  { glob: "sample.js", path: "sample.js" },
  { glob: "sample.js", path: "other.js" },
  { glob: "docs/**/*.md", path: "docs/readme.md" },
  { glob: "docs/**/*.md", path: "docs/sub/readme.md" },
  { glob: "src/*.tsx", path: "src/button.tsx" },
  { glob: "src/*.tsx", path: "src/app/page.tsx" },
  { glob: "src/button.tsx", path: "./src/button.tsx" },
  { glob: "/src/button.tsx", path: "src/button.tsx" },
  { glob: "src/file?.js", path: "src/file1.js" },
  { glob: "src/**", path: "src/a/b.js" },
  { glob: "src/*.foo", path: "src/button.tsx" },
];

// An unsupported row falls outside the noMatch population, so an empty noMatch does not by itself
// mean a match. code.js injects nothing for an unsupported row either, so this reads it as
// "no match".
async function scriptMatches(glob, path) {
  const { checkIndex } = await import(scriptPath);
  const table = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    `| ${glob} | fixture row | ${REF_PATH} |`,
  ].join("\n");
  const result = checkIndex({ table, exists: () => true, trackedFiles: [path] });
  if (result.unsupported.length > 0) return false;
  return result.noMatch.length === 0;
}

// code.js exposes no API for the decision, so the table is injected through the reader agent's
// return value and whether a read instruction rides the impl step's prompt is taken as the match.
async function codeMatches(glob, path) {
  const table = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    `| ${glob} | fixture row | ${REF_PATH} |`,
  ].join("\n");
  const plan = {
    test_command: "echo test",
    units: [
      {
        id: "U-1",
        goal: "fixture goal",
        files: [path],
        contract: "fixture contract",
        tests: [],
        seam: false,
      },
    ],
  };
  const stub = (prompt, opts) => {
    const label = opts.label ?? "";
    if (label === "reference-index") return { found: true, table };
    if (label.startsWith("impl:")) return { green: true, notes: "", deferred: [] };
    if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
    throw new Error(`unexpected label: ${label}`);
  };
  const { calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "" },
    stubs: { agent: stub },
  });
  const impl = calls.agent.find((c) => (c.opts.label ?? "") === "impl:U-1");
  assert.ok(impl, "the impl:U-1 agent runs");
  return new RegExp(`Read before implementing: ${REF_PATH.replace(/\./g, "\\.")}`).test(
    impl.prompt,
  );
}

test("for every (glob, path) pair in the shared fixture table, code.js's injection and the script's match decision agree", async () => {
  const mismatches = [];
  for (const { glob, path } of FIXTURE) {
    const [fromScript, fromCode] = await Promise.all([
      scriptMatches(glob, path),
      codeMatches(glob, path),
    ]);
    if (fromScript !== fromCode) {
      mismatches.push({ glob, path, fromScript, fromCode });
    }
  }
  assert.deepEqual(
    mismatches,
    [],
    `rows where the script and code.js disagree: ${JSON.stringify(mismatches)}`,
  );
});
