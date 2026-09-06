/// <reference types="node" />
// run-workflow.js, codex-run.js and tests/_brace.js are retired once their TypeScript
// replacements (run-workflow.ts, codex-run.ts, tests/_brace.ts) carry the harness. This file
// guards the retirement itself, the same way workflows/_lib/tests/gate-retirement.test.ts guards
// gate.py's: no tracked file outside docs/decisions/ and .claude/workspace/research/ (kept as
// historical record, per docs/wiki/retire-rename-procedure.md) still names a retired path.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const SELF_PATH = relative(REPO_ROOT, fileURLToPath(import.meta.url));

const HISTORICAL_DIRS = ["docs/decisions/", ".claude/workspace/research/"];

function isHistorical(path: string): boolean {
  return HISTORICAL_DIRS.some((dir) => path.startsWith(dir));
}

// The one predicate the scans below rely on, factored out so the positive control drives it
// directly instead of re-deriving its own copy
// (docs/wiki/absence-test-positive-control-fixture.md).
function referencesPath(content: string, retiredPath: string): boolean {
  return content.includes(retiredPath);
}

// The tree does not change while this file's tests run, and T-043 checks 2 retired paths
// against it, so the git spawn is cached after the first call rather than repeated per path.
let trackedFilesCache: string[] | null = null;
function trackedFiles(): string[] {
  trackedFilesCache ??= execFileSync("git", ["ls-files", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  return trackedFilesCache;
}

function offendersFor(retiredPath: string): string[] {
  const offenders: string[] = [];
  for (const path of trackedFiles()) {
    // This test's own file names each retiredPath to describe what it checks, and a doc under
    // docs/decisions/ or .claude/workspace/research/ keeps the retired name as history rather
    // than as a live reference.
    if (path === SELF_PATH || isHistorical(path)) continue;
    let content: string;
    try {
      content = readFileSync(join(REPO_ROOT, path), "utf8");
    } catch {
      continue; // not decodable as text, so it cannot contain the retired path as a string
    }
    if (referencesPath(content, retiredPath)) offenders.push(path);
  }
  return offenders;
}

// Positive control: an absence check stays green even after the scan itself breaks (e.g. the
// retired path mistyped, the .includes() call dropped) unless it is proven to still catch a
// violation. Run the same predicate against a fixture naming the retired path and confirm it is
// caught, then against a copy with that one clue removed and confirm the miss.
function assertDetectsAndMisses(retiredPath: string): void {
  const positiveControl = `# stale doc example: run node workflows/${retiredPath}`;
  assert.equal(
    referencesPath(positiveControl, retiredPath),
    true,
    `positive control (${retiredPath}): a copy carrying the cue is detected`,
  );
  const masked = positiveControl.replace(retiredPath, "REMOVED");
  assert.equal(
    referencesPath(masked, retiredPath),
    false,
    `positive control (${retiredPath}): the same violation goes undetected once the cue is removed`,
  );
}

test("T-042 no tracked file outside docs/decisions/ and .claude/workspace/research/ references _lib/run-workflow.js", () => {
  const RETIRED_PATH = "_lib/run-workflow.js";
  assertDetectsAndMisses(RETIRED_PATH);

  const offenders = offendersFor(RETIRED_PATH);
  assert.deepEqual(
    offenders,
    [],
    `files still naming ${RETIRED_PATH} (docs/decisions/ and .claude/workspace/research/ are ` +
      `kept as history, not counted): ${offenders.join(", ")}`,
  );
});

test("T-043 no tracked file outside docs/decisions/ and .claude/workspace/research/ references _lib/codex-run.js or _lib/tests/_brace.js", () => {
  for (const retiredPath of ["_lib/codex-run.js", "_lib/tests/_brace.js"]) {
    assertDetectsAndMisses(retiredPath);

    const offenders = offendersFor(retiredPath);
    assert.deepEqual(
      offenders,
      [],
      `files still naming ${retiredPath} (docs/decisions/ and .claude/workspace/research/ are ` +
        `kept as history, not counted): ${offenders.join(", ")}`,
    );
  }
});
