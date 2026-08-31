/// <reference types="node" />
// gate.py is retired in favor of gate.ts (workflows/_lib/gate.ts, .ja/workflows/_lib/gate.ts,
// established by the preceding units). This file guards the retirement itself: no tracked file
// still names the retired path, and the EN / .ja copies of code.js agree on the replacement.
//
// Full-tree scan per docs/wiki/retire-rename-procedure.md: update both trees and docs in one
// change, then confirm zero residual references across git ls-files. A mention under
// docs/decisions/ is kept as historical record by that same procedure, so it is excluded here
// rather than counted as a leftover reference.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const SELF_PATH = relative(REPO_ROOT, fileURLToPath(import.meta.url));

const RETIRED_PATH = "_lib/gate.py";
const HISTORICAL_DIR = "docs/decisions/";

// The one predicate the absence scan below relies on, factored out so the positive
// control can drive it directly instead of re-deriving its own copy
// (docs/wiki/absence-test-positive-control-fixture.md).
function referencesRetiredPath(content: string): boolean {
  return content.includes(RETIRED_PATH);
}

test("T-014 no tracked file references _lib/gate.py", () => {
  // Positive control: an absence check stays green even after the scan itself breaks
  // (e.g. RETIRED_PATH mistyped, the .includes() call dropped) unless it is proven to still
  // catch a violation. Run the same predicate against a fixture that names the retired path
  // and confirm it is caught, then against a copy with that one clue removed and confirm the
  // miss (docs/wiki/absence-test-positive-control-fixture.md).
  const positiveControl = `# stale doc example: run python3 workflows/${RETIRED_PATH}`;
  assert.equal(
    referencesRetiredPath(positiveControl),
    true,
    "positive control: a copy carrying the cue is detected",
  );
  const masked = positiveControl.replace(RETIRED_PATH, "REMOVED");
  assert.equal(masked.includes(RETIRED_PATH), false, "the masked copy no longer carries the cue");
  assert.equal(
    referencesRetiredPath(masked),
    false,
    "positive control: the same violation goes undetected once the cue is removed",
  );

  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const offenders: string[] = [];
  for (const path of tracked) {
    // This test's own file names RETIRED_PATH to describe what it checks, and a DR under
    // docs/decisions/ keeps the retired name as history rather than as a live reference.
    if (path === SELF_PATH || path.startsWith(HISTORICAL_DIR)) continue;
    let content: string;
    try {
      content = readFileSync(join(REPO_ROOT, path), "utf8");
    } catch {
      continue; // not decodable as text, so it cannot contain the retired path as a string
    }
    if (referencesRetiredPath(content)) offenders.push(path);
  }
  assert.deepEqual(
    offenders,
    [],
    `files still naming ${RETIRED_PATH} (docs/decisions/ is kept as history, not counted): ${offenders.join(", ")}`,
  );
});

// Same extraction shape as workflows/audit/tests/audit.routing.test.js's parseNumericConst:
// read both sources and compare what they actually hold, never a copied-in literal
// (docs/wiki/workflow-const-source-text-check.md).
function extractGateScript(source: string): string | null {
  const m = source.match(/const gateScript = bundled\("([^"]+)"\)/);
  return m ? m[1] : null;
}

test("T-016 the EN and .ja code.js carry the same gateScript constant", () => {
  const enSource = readFileSync(join(REPO_ROOT, "workflows", "code.js"), "utf8");
  const jaSource = readFileSync(join(REPO_ROOT, ".ja", "workflows", "code.js"), "utf8");
  const enGateScript = extractGateScript(enSource);
  const jaGateScript = extractGateScript(jaSource);
  assert.ok(enGateScript, "gateScript is extractable from workflows/code.js");
  assert.ok(jaGateScript, "gateScript is extractable from .ja/workflows/code.js");
  assert.equal(jaGateScript, enGateScript, "EN and .ja gateScript point at different files");
  assert.equal(
    enGateScript,
    "workflows/_lib/gate.ts",
    "gateScript still points at the retired gate.py",
  );
});
