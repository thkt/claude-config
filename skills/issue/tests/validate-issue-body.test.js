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
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
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
// The floor is read from the script so a change there fails these fixtures instead of drifting.
const floorFor = (type) => {
  const src = readFileSync(script, "utf8");
  const block = src.match(/^FLOOR = \{([\s\S]*?)^\}/m)?.[1] ?? "";
  const row = block.match(new RegExp(`"${type}":\\s*\\(([^)]*)\\)`))?.[1] ?? "";
  return [...row.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
};

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
// skill's templates. That file carries no "## Template" fence, so reading only the fenced skeleton
// finds no section and faults every heading of a correct body as unknown_section. Following
// validation-errors.md from there deletes sections that were right.
test("T-012 a repository .md template is read as the skeleton and does not close the section set", () => {
  const dir = mkdtempSync(join(tmpdir(), "issue-repo-template-"));
  try {
    const template = join(dir, "feature.md");
    writeFileSync(
      template,
      "---\nname: Feature request\nlabels: enhancement\n---\n\n## What & Why\n\n## Scope\n",
      "utf8",
    );
    const floor = floorFor("feature")
      .map((s) => `## ${s}\n\nx\n`)
      .join("\n");
    const body = `## What & Why\n\nx\n\n## Scope\n\ny\n\n${floor}\n## Notes\n\nz\n`;
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

// Zero sections used to mean zero requirements: a .yml whose body: key the parser missed raised
// no error and passed any body. These run the repository's own forms, which rank first as the
// skeleton, and assert the parser finds their sections rather than falling through silently.
test("T-015 the repository's own forms are read as skeletons rather than passing empty", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const dir = join(root, ".github", "ISSUE_TEMPLATE");
  const forms = (await readdir(dir)).filter((f) => f.endsWith(".yml"));
  assert.ok(forms.length > 0, "the repository ships issue forms");
  for (const form of forms) {
    const path = join(dir, form);
    const labels = [...(await readFile(path, "utf8")).matchAll(/^\s*label:\s*(.+?)\s*$/gm)];
    assert.ok(labels.length > 0, `${form}: it declares labels`);
    const type = form.replace(/\.yml$/, "");
    const rows = labels.map((m) => m[1]).concat(floorFor(type));
    const body = rows.map((s) => `## ${s}\n\nx\n`).join("\n");
    const title = `[${type[0].toUpperCase()}${type.slice(1)}] sample`;
    const { status, out } = runValidate(path, title, body);
    assert.equal(status, 0, `${form}: a body carrying every label passes (${JSON.stringify(out)})`);
    assert.ok(
      out.checks.some((c) => c.startsWith("section:")),
      `${form}: the parser reported the sections it read (${out.checks.join(", ")})`,
    );
  }
});

// A skeleton the parser cannot read is not a skeleton with no requirements. Without this the
// required check has nothing to compare and the unknown check is skipped for a form, so every
// body exits 0 against a broken template.
test("T-016 a skeleton yielding no section is an error, not a free pass", () => {
  const dir = mkdtempSync(join(tmpdir(), "issue-empty-skeleton-"));
  try {
    const form = join(dir, "feature.yml");
    writeFileSync(form, "name: Feature\nentries:\n  - type: textarea\n", "utf8");
    const { status, out } = runValidate(form, "[Feature] sample", "## Anything\n\nx\n");
    assert.equal(status, 1, "it exits 1");
    assert.ok(
      out.errors.some((e) => e.startsWith("unreadable_skeleton:")),
      `the error names the unreadable skeleton (${out.errors.join(", ")})`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A repository form states the web UI's minimum, which is thinner than what a filed issue has to
// carry: feature.yml requires Priority and the problem statement and nothing else. Without a floor
// of its own the skill files a feature with no acceptance criteria and a bug with no reproduction.
test("T-017 a body meeting the form but missing the type's floor is an error", async () => {
  const { readdir } = await import("node:fs/promises");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const dir = join(root, ".github", "ISSUE_TEMPLATE");
  for (const form of (await readdir(dir)).filter((f) => f.endsWith(".yml"))) {
    const type = form.replace(/\.yml$/, "");
    const floor = floorFor(type);
    assert.ok(floor.length > 0, `${type}: the floor is readable`);
    const path = join(dir, form);
    const labels = [...readFileSync(path, "utf8").matchAll(/^\s*label:\s*(.+?)\s*$/gm)].map(
      (m) => m[1],
    );
    const body = labels.map((label) => `## ${label}\n\nx\n`).join("\n");
    const uncovered = floor.filter(
      (name) => !labels.some((label) => label.toLowerCase() === name.toLowerCase()),
    );
    assert.ok(
      uncovered.length > 0,
      `${form}: the form leaves at least one floor section uncovered`,
    );
    const { status, out } = runValidate(path, `[${type[0].toUpperCase()}${type.slice(1)}] x`, body);
    assert.equal(status, 1, `${form}: it exits 1 without the floor`);
    for (const name of uncovered) {
      assert.ok(
        out.errors.includes(`missing_section:${name}`),
        `${form}: ${name} is reported missing (${out.errors.join(", ")})`,
      );
    }
  }
});

// The split assessment publishes the issue as an epic. Rewriting the prefix to [Epic] leaves the
// title naming a type no skeleton answers to, and validation-errors.md then tells the writer to
// pick the matching template, which does not exist. The type detection table is the closed set.
test("T-018 only a type the detection table carries clears the title check", async () => {
  const { readdir } = await import("node:fs/promises");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const dir = join(root, ".github", "ISSUE_TEMPLATE");
  const form = join(dir, "feature.yml");
  const labels = [...readFileSync(form, "utf8").matchAll(/^\s*label:\s*(.+?)\s*$/gm)];
  const body = labels
    .map((m) => m[1])
    .concat(floorFor("feature"))
    .map((s) => `## ${s}\n\nx\n`)
    .join("\n");
  assert.equal(runValidate(form, "[Feature] x", body).status, 0, "the detected type clears it");
  const epic = runValidate(form, "[Epic] x", body);
  assert.equal(epic.status, 1, "a type with no skeleton does not clear it");
  assert.ok(
    epic.out.errors.some((e) => e.startsWith("type_mismatch:")),
    `the error names the mismatch (${epic.out.errors.join(", ")})`,
  );
  const types = (await readdir(dir)).map((f) => f.replace(/\.(yml|md)$/, ""));
  assert.ok(!types.includes("epic"), "no epic skeleton exists to answer an [Epic] title");
});

// The headings alone were the whole gate: a body carrying nothing but the template's own prompts
// passed with no error, which is the state a filing reaches when nobody wrote it.
test("T-019 a body still carrying the template's prompts is an error", () => {
  const src = readFileSync(featureTemplate, "utf8");
  const fence = src.slice(src.search(/^## Template$/m)).match(/```(?:markdown)?\n([\s\S]*?)```/)[1];
  const { status, out } = runValidate(featureTemplate, "[Feature] sample", fence);
  assert.equal(status, 1, "it exits 1");
  assert.ok(
    out.errors.some((e) => e.startsWith("placeholder_left:")),
    `expected placeholder_left, got ${JSON.stringify(out.errors)}`,
  );
});

// A checkbox with nothing after it satisfies the heading check while stating no criterion.
test("T-020 a required section holding nothing but an empty checkbox is an error", () => {
  const body = [
    "## What & Why",
    "",
    "Users export orders by hand every morning.",
    "",
    "## Acceptance Criteria",
    "",
    "- [ ]",
    "",
    "## Scope",
    "",
    "- In scope: CSV export from the orders list",
    "",
    "## Testing Decisions",
    "",
    "- Test the CSV serializer",
    "",
  ].join("\n");
  const { status, out } = runValidate(featureTemplate, "[Feature] sample", body);
  assert.equal(status, 1, "it exits 1");
  assert.deepEqual(out.errors, ["unfilled_section:Acceptance Criteria"]);
});

// Matching braces anywhere would fault a criterion that names a payload shape, so a written body
// would have to avoid its own domain vocabulary to pass.
test("T-021 braces naming a shape in prose are not read as an unwritten prompt", () => {
  const body = [
    "## What & Why",
    "",
    "Callers cannot tell a failed run from an empty one.",
    "",
    "## Acceptance Criteria",
    "",
    "- [ ] The CLI returns {status, findings} without a wrapper",
    "",
    "## Scope",
    "",
    "- In scope: the CLI envelope",
    "",
    "## Testing Decisions",
    "",
    "- Assert the two keys against the parsed stdout",
    "",
  ].join("\n");
  const { status, out } = runValidate(featureTemplate, "[Feature] sample", body);
  assert.equal(status, 0, `it exits 0, got ${JSON.stringify(out.errors)}`);
  assert.ok(out.checks.includes("placeholder=none"), "it records that no prompt is left");
});

// TBD is what a section carries while the writer is still deciding, and filing it hands build a
// requirement nobody settled.
test("T-022 a required section holding nothing but TBD is an error", () => {
  const body = [
    "## What & Why",
    "",
    "Users export orders by hand every morning.",
    "",
    "## Acceptance Criteria",
    "",
    "- [ ] When a user clicks Export, a .csv downloads",
    "",
    "## Scope",
    "",
    "- In scope: CSV export from the orders list",
    "",
    "## Testing Decisions",
    "",
    "TBD",
    "",
  ].join("\n");
  const { status, out } = runValidate(featureTemplate, "[Feature] sample", body);
  assert.equal(status, 1, "it exits 1");
  assert.deepEqual(out.errors, ["unfilled_section:Testing Decisions"]);
});

const runContentOnly = (bodyText) => {
  const dir = mkdtempSync(join(tmpdir(), "validate-issue-body-"));
  try {
    const bodyPath = join(dir, "body.md");
    writeFileSync(bodyPath, bodyText, "utf8");
    const res = spawnSync("python3", [script, "--content-only", bodyPath], { encoding: "utf8" });
    return { status: res.status, out: JSON.parse(res.stdout) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// The number route edits an issue filed against a template nobody recorded, so the skeleton checks
// have nothing to run against. Leaving the whole validation out let a transfer that wrote a prompt
// instead of content reach the issue.
test("T-023 --content-only needs no skeleton and still catches a body left unwritten", () => {
  const unwritten = ["## Plan", "", "{Outcome}", ""].join("\n");
  const written = ["## Plan", "", "Outcome: the exporter writes one row per order.", ""].join("\n");
  assert.equal(runContentOnly(unwritten).status, 1, "an unwritten body exits 1");
  assert.equal(runContentOnly(written).status, 0, "a written body exits 0");
});

// A body quoting a payload or a config sample carries braces that belong to the quotation. Counting
// them makes an issue that documented its own interface unfileable.
test("T-024 braces inside a fenced block are not read as prompts", () => {
  const body = [
    "## Plan",
    "",
    "The exporter writes one row per order.",
    "",
    "```json",
    "{version}",
    "```",
    "",
  ].join("\n");
  const { status, out } = runContentOnly(body);
  assert.equal(status, 0, `it exits 0, got ${JSON.stringify(out.errors)}`);
  assert.ok(out.checks.includes("placeholder=none"), "it records that no prompt is left");
});

test("T-026 a form label that differs from the bug floor only in case satisfies the floor", () => {
  const dir = mkdtempSync(join(tmpdir(), "validate-issue-body-"));
  try {
    const form = join(dir, "bug.yml");
    writeFileSync(
      form,
      [
        "name: Bug report",
        "body:",
        "  - type: textarea",
        "    attributes:",
        "      label: What happened?",
        "    validations:",
        "      required: true",
        "  - type: textarea",
        "    attributes:",
        "      label: Steps to reproduce",
        "",
      ].join("\n"),
    );
    const body = [
      "## What happened?",
      "",
      "x",
      "",
      "## Steps to reproduce",
      "",
      "1. x",
      "",
      "## Expected vs Actual",
      "",
      "- x",
      "",
    ].join("\n");
    const { status, out } = runValidate(form, "[Bug] x", body);
    assert.equal(status, 0, `it exits 0, got ${JSON.stringify(out.errors)}`);
    assert.ok(
      !out.errors.includes("missing_section:Steps to Reproduce"),
      "the lowercase form label stands in for the floor's capitalization",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A repository form written in Japanese requires 再現手順 and 期待 / 実際. Those are the bug floor
// under another name, so a body carrying them must not also have to carry the English headings.
test("T-025 a Japanese form's required sections satisfy the bug floor", () => {
  const dir = mkdtempSync(join(tmpdir(), "validate-issue-body-"));
  try {
    const form = join(dir, "bug.yml");
    writeFileSync(
      form,
      [
        "name: バグ",
        "body:",
        "  - type: textarea",
        "    attributes:",
        "      label: 事象",
        "    validations:",
        "      required: true",
        "  - type: textarea",
        "    attributes:",
        "      label: 再現手順",
        "    validations:",
        "      required: true",
        "  - type: textarea",
        "    attributes:",
        "      label: 期待 / 実際",
        "    validations:",
        "      required: true",
        "",
      ].join("\n"),
    );
    const body = [
      "## 事象",
      "",
      "x",
      "",
      "## 再現手順",
      "",
      "1. x",
      "",
      "## 期待 / 実際",
      "",
      "- x",
      "",
    ].join("\n");
    const { status, out } = runValidate(form, "[Bug] x", body);
    assert.equal(status, 0, `it exits 0, got ${JSON.stringify(out.errors)}`);
    for (const name of floorFor("bug")) {
      assert.ok(!out.errors.includes(`missing_section:${name}`), `${name} is not reported missing`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
