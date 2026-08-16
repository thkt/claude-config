// These start skills/issue/scripts/validate-issue-body.py as a real subprocess and pin its CLI
// contract (arguments -> stdout JSON -> exit code). They stay off python's test discovery.
//
// The CLI contract:
//   Usage: validate-issue-body.py <template-file> <title> <body-file>
//   stdout: JSON { errors, warnings, checks }
//   exit: 0 if no errors (warnings allowed), 1 if errors
//
// The skeleton is read from the first code block under <template-file>'s "## Template" heading.
// "## Template" and "## Guidelines" themselves are not part of it. A section whose heading ends in
// "(optional)" is optional and falls outside missing_section. The match runs on sets and ignores
// the order of the sections in the body.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const script = join(root, "skills", "issue", "scripts", "validate-issue-body.py");
const bugTemplate = join(root, "skills", "issue", "templates", "bug.md");
const choreTemplate = join(root, "skills", "issue", "templates", "chore.md");
const featureTemplate = join(root, "skills", "issue", "templates", "feature.md");

// The body is written to a temporary file before being passed. validate-outcome.py also takes a
// file path argument, so this matches the shape the caller (/issue's Phase 4 validation) uses.
const runValidate = (templatePath, title, bodyText) => {
  const dir = mkdtempSync(join(tmpdir(), "validate-issue-body-"));
  try {
    const bodyPath = join(dir, "body.md");
    writeFileSync(bodyPath, bodyText, "utf8");
    const res = spawnSync("python3", [script, templatePath, title, bodyPath], {
      encoding: "utf8",
    });
    let out;
    try {
      out = JSON.parse(res.stdout);
    } catch {
      out = null;
    }
    return { status: res.status, out, stderr: res.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("T-001 returns missing_section with the section name when a required skeleton section is absent from the body", () => {
  const body = [
    "## What & Why",
    "",
    "Login fails for some users.",
    "",
    "## Steps to Reproduce",
    "",
    "1. Open app",
    "2. Log in",
    "",
    "## Scope",
    "",
    "- In scope: login flow",
    "- Out of scope: signup flow",
    "",
  ].join("\n");
  const { status, out } = runValidate(bugTemplate, "[Bug] Login fails for some users", body);
  assert.ok(out, "stdout parses as JSON");
  assert.equal(status, 1, "a run carrying errors exits 1");
  assert.ok(
    out.errors.includes("missing_section:Expected vs Actual"),
    `errors carries missing_section:Expected vs Actual with the section name (actual: ${JSON.stringify(out.errors)})`,
  );
});

test("T-002 Plan and Backlog candidates, absent from the skeleton, do not become errors", () => {
  const body = [
    "## What & Why",
    "",
    "Login fails for some users.",
    "",
    "## Steps to Reproduce",
    "",
    "1. Open app",
    "2. Log in",
    "",
    "## Expected vs Actual",
    "",
    "- Expected: 200 OK",
    "- Actual: 500 error",
    "",
    "## Scope",
    "",
    "- In scope: login flow",
    "- Out of scope: signup flow",
    "",
    "## Plan",
    "",
    "- Step 1",
    "",
    "## Backlog candidates",
    "",
    "- Follow-up idea",
    "",
  ].join("\n");
  const { status, out } = runValidate(bugTemplate, "[Bug] Login fails for some users", body);
  assert.ok(out, "stdout parses as JSON");
  assert.equal(status, 0, "every required skeleton section present exits 0");
  assert.deepEqual(
    out.errors,
    [],
    `Plan and Backlog candidates, absent from the skeleton, stay out of errors (actual: ${JSON.stringify(out.errors)})`,
  );
});

test("T-011 a body carrying a section absent from the skeleton returns unknown_section even with every required section present", () => {
  // T-001 covers a body missing a required section. Here every required section is present, so
  // the run does not stop at missing_section and only the extra-section route is exercised.
  const body = [
    "## What & Why",
    "",
    "Login fails for some users.",
    "",
    "## Steps to Reproduce",
    "",
    "1. Open app",
    "",
    "## Expected vs Actual",
    "",
    "- Expected: 200 OK",
    "- Actual: 500 error",
    "",
    "## Scope",
    "",
    "- In scope: login flow",
    "",
    "## Changes",
    "",
    "- Rewrote the session handler",
    "",
  ].join("\n");
  const { status, out } = runValidate(bugTemplate, "[Bug] Login fails for some users", body);
  assert.ok(out, "stdout parses as JSON");
  assert.equal(status, 1, "a body carrying a section outside the skeleton exits 1");
  assert.deepEqual(
    out.errors,
    ["unknown_section:Changes"],
    `Changes, absent from the skeleton, lands in errors with its section name (actual: ${JSON.stringify(out.errors)})`,
  );
});

test("T-003 returns type_mismatch when the title's type and the template passed disagree", () => {
  const body = [
    "## What & Why",
    "",
    "Login fails for some users.",
    "",
    "## Acceptance Criteria",
    "",
    "- [ ] When user logs in, session persists",
    "",
    "## Scope",
    "",
    "- In scope: login flow",
    "- Out of scope: signup flow",
    "",
    "## Testing Decisions",
    "",
    "- Cover the session persistence path",
    "",
  ].join("\n");
  // The title is [Bug] while the template passed is feature.md, so the types disagree.
  const { status, out } = runValidate(featureTemplate, "[Bug] Login fails for some users", body);
  assert.ok(out, "stdout parses as JSON");
  assert.equal(status, 1, "a run carrying type_mismatch exits 1");
  assert.ok(
    out.errors.some((e) => e.startsWith("type_mismatch:")),
    `errors carries type_mismatch (actual: ${JSON.stringify(out.errors)})`,
  );
});

test("T-004 a body whose section order differs from the skeleton does not become an error", () => {
  const body = [
    "## Scope",
    "",
    "- In scope: dependency bump",
    "- Out of scope: unrelated refactor",
    "",
    "## Changes",
    "",
    "- Update package.json",
    "",
    "## What & Why",
    "",
    "Bump the dependency to close a known issue.",
    "",
  ].join("\n");
  const { status, out } = runValidate(choreTemplate, "[Chore] Bump dependency", body);
  assert.ok(out, "stdout parses as JSON");
  assert.equal(status, 0, "a differing section order still exits 0 when every section is present");
  assert.deepEqual(
    out.errors,
    [],
    `a difference in order does not become an error (actual: ${JSON.stringify(out.errors)})`,
  );
});
