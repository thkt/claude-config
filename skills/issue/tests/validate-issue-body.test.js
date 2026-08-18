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

// Template source ranks a repository's own .github/ISSUE_TEMPLATE/<type>.md second, ahead of the
// skill's templates. That file is the raw body with no "## Template" fence, so reading only the
// fenced skeleton returned no sections and faulted every heading of a correct body as
// unknown_section. validation-errors.md then tells the writer to delete those correct sections.
test("T-012 a repository .md template is read as the skeleton and does not close the section set", () => {
  const dir = mkdtempSync(join(tmpdir(), "issue-repo-template-"));
  try {
    const template = join(dir, "feature.md");
    writeFileSync(
      template,
      "---\nname: Feature request\nlabels: enhancement\n---\n\n## What & Why\n\n## Scope\n",
      "utf8",
    );
    const body = "## What & Why\n\nx\n\n## Scope\n\ny\n\n## Notes\n\nz\n";
    const { status, out } = runValidate(template, "[Feature] Add CSV export", body);
    assert.equal(status, 0, `a correct body passes (${JSON.stringify(out)})`);
    assert.deepEqual(out.errors, [], "no error is raised");
    assert.ok(
      out.checks.includes("section:What & Why=ok"),
      `the repository template's headings are read (${out.checks.join(", ")})`,
    );
    assert.ok(
      out.checks.some((c) => c.startsWith("unknown_section=skipped")),
      "an added section is not faulted against a repository template",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// skeleton_sections anchors on the literal "## Template" heading, so that heading is a parse
// anchor rather than prose and stays identical on both sides per MIRROR.md. Translating it on the
// Japanese side made the fallback branch read `テンプレート` as a section name of its own.
test("T-013 both languages anchor the skeleton on the same heading", async () => {
  const { readFile } = await import("node:fs/promises");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  for (const type of ["bug", "chore", "docs", "feature"]) {
    for (const prefix of ["", ".ja"]) {
      const path = join(root, prefix, "skills", "issue", "templates", `${type}.md`);
      const doc = await readFile(path, "utf8");
      assert.match(doc, /^## Template$/m, `${prefix || "en"}/${type}: the skeleton anchor`);
    }
  }
});

// The four templates are the skeleton Phase 4 validates the body against, so a body built from a
// template's own required sections has to pass. The other cases here use synthetic skeletons; this
// one runs the real files, which is what an edit to a template actually breaks.
const TYPES = ["bug", "chore", "docs", "feature"];

test("T-014 a body built from each template's own required sections passes validation", async () => {
  const { readFile } = await import("node:fs/promises");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  for (const type of TYPES) {
    const path = join(root, "skills", "issue", "templates", `${type}.md`);
    const src = await readFile(path, "utf8");
    const after = src.slice(src.search(/^## Template$/m));
    const fence = after.match(/```(?:markdown)?\n([\s\S]*?)```/)[1];
    let optional = false;
    const body = fence
      .split("\n")
      .filter((line) => {
        const heading = line.match(/^## (.+?)\s*$/);
        if (heading) optional = /\((optional|任意)\)$/.test(heading[1]);
        return !optional;
      })
      .join("\n")
      .replace(/\{[^}]*\}/g, "x");
    const title = `[${type[0].toUpperCase()}${type.slice(1)}] sample`;
    const { status, out } = runValidate(path, title, `${body}\n`);
    assert.deepEqual(out.errors, [], `${type}: a body from its own skeleton raises no error`);
    assert.equal(status, 0, `${type}: it exits 0`);
  }
});
