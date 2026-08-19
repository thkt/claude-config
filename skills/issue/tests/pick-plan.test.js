import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const script = join(root, "skills", "issue", "scripts", "pick-plan.py");

const DRAFT = (slug) =>
  [
    "## Plan",
    "",
    `Outcome: ${slug} is done`,
    "",
    "### U-001 first",
    "",
    "- files: `a.js`",
    "",
    "## Backlog candidates",
    "",
    "- something out of scope",
    "",
    "## Notes",
    "",
    "- not transferred",
    "",
  ].join("\n");

const run = (...args) => {
  const res = spawnSync("python3", [script, ...args], { encoding: "utf8" });
  return { status: res.status, out: res.stdout ? JSON.parse(res.stdout) : null };
};

const withDrafts = (slugs, body) => {
  const dir = mkdtempSync(join(tmpdir(), "pick-plan-"));
  try {
    for (const [date, slug] of slugs)
      writeFileSync(join(dir, `${date}-${slug}.plan.md`), DRAFT(slug), "utf8");
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// Phase 3 transfers the two sections verbatim. Taking the whole file would carry /think's own
// headings into the issue, and stopping at the first blank line would truncate a section.
test("a draft path returns the two sections and nothing else", () =>
  withDrafts([["2026-08-19", "add-csv-export"]], (dir) => {
    const { status, out } = run(join(dir, "2026-08-19-add-csv-export.plan.md"));
    assert.equal(status, 0);
    assert.match(out.plan, /^## Plan\n/);
    assert.match(out.plan, /### U-001 first/);
    assert.doesNotMatch(out.plan, /## Backlog candidates/);
    assert.match(out.backlog, /^## Backlog candidates\n/);
    assert.doesNotMatch(out.backlog, /## Notes/);
  }));

// The slug comes from the title handed to /think and the issue title is written separately, so a
// tie is the normal outcome rather than an edge case. Choosing one anyway transfers a plan that
// belongs to another issue, and nothing downstream can tell.
test("several drafts sharing the top score are reported rather than chosen", () =>
  withDrafts(
    [
      ["2026-08-19", "build-stop-reasons"],
      ["2026-08-18", "build-unit-caps"],
    ],
    (dir) => {
      const { out } = run("[Feature] build の話", dir);
      assert.equal(out.path, null, "it does not choose");
      assert.equal(out.ambiguous, true, "it says the choice is open");
      assert.equal(out.candidates.length, 2, "both are handed back");
    },
  ));

test("one draft scoring alone is chosen and extracted", () =>
  withDrafts(
    [
      ["2026-08-19", "add-csv-export"],
      ["2026-08-18", "rename-buttons"],
    ],
    (dir) => {
      const { out } = run("[Feature] add csv export", dir);
      assert.match(out.path, /add-csv-export/);
      assert.equal(out.ambiguous, false);
      assert.match(out.plan, /^## Plan\n/);
    },
  ));

// An issue filed before any planning is the normal first case. Exiting non-zero there would stop
// the skill on its most common path.
test("a missing directory is a no-match rather than a failure", () => {
  const { status, out } = run("[Feature] x", join(tmpdir(), "pick-plan-absent"));
  assert.equal(status, 0);
  assert.equal(out.path, null);
  assert.deepEqual(out.candidates, []);
});

// The type prefix is not part of the slug /think writes. Leaked into the score it becomes a word
// like any other, so a draft named after the type outranks the one the title is about. The second
// draft here exists to make that reordering visible.
test("the bracketed type does not enter the score", () =>
  withDrafts(
    [
      ["2026-08-19", "chore-dependency-bumps"],
      ["2026-08-18", "feature-flags"],
    ],
    (dir) => {
      // One real word, so a leaked type word ties the two drafts instead of losing to them.
      const withPrefix = run("[Chore] flags", dir);
      const without = run("flags", dir);
      assert.match(without.out.path, /feature-flags/, "the bare title picks its own draft");
      assert.equal(withPrefix.out.path, without.out.path, "the prefix changes nothing");
      assert.equal(withPrefix.out.ambiguous, false, "the prefix does not create a tie");
    },
  ));
