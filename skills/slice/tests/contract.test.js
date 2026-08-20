import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const langs = ["en", "ja"];
const at = (lang, ...parts) => join(root, ...(lang === "ja" ? [".ja"] : []), ...parts);
const skill = (lang) => readFileSync(at(lang, "skills", "slice", "SKILL.md"), "utf8");
const grant = (lang) => /^allowed-tools:.*$/m.exec(skill(lang))[0];

// A command a phase invokes without a matching grant is refused at run time, and the refusal
// reads as a permission prompt rather than as a missing line in the frontmatter.
test("every command the phases invoke is covered by a grant", () => {
  for (const lang of langs) {
    const line = grant(lang);
    const body = skill(lang);
    for (const [needle, permission] of [
      ["gh issue create", "Bash(gh:*)"],
      ["cat", "Bash(cat:*)"],
      ["validate-issue-body.py", "Bash(python3:*)"],
    ]) {
      assert.ok(body.includes(needle), `${lang}: a phase invokes ${needle}`);
      assert.ok(line.includes(permission), `${lang}: ${permission} is granted for ${needle}`);
    }
  }
});

// slice files N issues in one batch. Without the validator, one body short of the floor becomes
// N bodies short of it, and nothing between here and build reports the gap.
test("publishing runs the same validator /issue runs", () => {
  for (const lang of langs) {
    const body = skill(lang);
    assert.match(
      body,
      /\$\{CLAUDE_SKILL_DIR\}\/\.\.\/issue\/scripts\/validate-issue-body\.py/,
      `${lang}: it names the validator by a path that resolves from this skill`,
    );
    assert.ok(
      existsSync(join(root, "skills", "issue", "scripts", "validate-issue-body.py")),
      "the validator is where the path points",
    );
  }
});

// The two wrapper sections are slice's own convention, so the validator has to know them by name.
// Otherwise every slice body comes back as unknown_section and the run stops on its own output.
test("the sections slice wraps every body in are the ones the validator permits", () => {
  const source = readFileSync(
    join(root, "skills", "issue", "scripts", "validate-issue-body.py"),
    "utf8",
  );
  const allowed = /^ALLOWED_EXTRA = frozenset\(\{(.*?)\}\)/ms.exec(source)[1];
  for (const lang of langs) {
    for (const section of ["## Parent", "## Blocked by"]) {
      assert.ok(skill(lang).includes(section), `${lang}: slice adds ${section}`);
      assert.ok(
        allowed.includes(`"${section.replace("## ", "")}"`),
        `ALLOWED_EXTRA permits ${section}`,
      );
    }
  }
});

// The validator requires a bracketed type in the title. A field telling the author to write a
// plain name produces a body that is correct and a title the validator rejects.
test("the title field requires the bracketed type the validator checks for", () => {
  const source = readFileSync(
    join(root, "skills", "issue", "scripts", "validate-issue-body.py"),
    "utf8",
  );
  assert.match(source, /TYPE_PREFIX = re\.compile/, "the validator reads a bracketed prefix");
  for (const lang of langs) {
    const row = skill(lang)
      .split("\n")
      .find((line) => line.startsWith("| Title"));
    assert.ok(row, `${lang}: the field table names Title`);
    assert.match(row, /\[Feature\]/, `${lang}: the Title row shows the bracketed form`);
  }
});

// Both skills file into one tracker, so the ladder has to live in one place. A copy in slice
// drifts from /issue's and the same repository ends up with two shapes of body.
test("both filing skills take the skeleton from the one shared reference", () => {
  const reference = join("issue", "references", "template-source.md");
  assert.ok(existsSync(join(root, "skills", reference)), "the shared reference exists");
  for (const lang of langs) {
    assert.match(
      skill(lang),
      /\$\{CLAUDE_SKILL_DIR\}\/\.\.\/issue\/references\/template-source\.md/,
      `${lang}: slice points at the shared reference`,
    );
    assert.match(
      readFileSync(at(lang, "skills", "issue", "SKILL.md"), "utf8"),
      /\$\{CLAUDE_SKILL_DIR\}\/references\/template-source\.md/,
      `${lang}: issue points at the shared reference`,
    );
  }
});

// A slice reaches build only through this chain. Naming the plan step without naming the route
// that writes it leaves the reader hand-editing the issue body.
test("the handoff names the route that writes the plan into the issue", () => {
  for (const lang of langs) {
    const section = skill(lang).split("\n## Phase 1")[0];
    assert.match(section, /\/think/, `${lang}: the chain starts at /think`);
    assert.match(
      section,
      /\/issue <(number|番号)>/,
      `${lang}: it names the number route as what moves the plan`,
    );
    assert.match(section, /## Plan/, `${lang}: it names the section the plan lands in`);
  }
});

// A source that already carries a plan has its units settled. Running /think once per slice
// re-derives what the source states, and the two answers then disagree on the same work.
test("a source carrying a plan is distributed rather than re-planned", () => {
  for (const lang of langs) {
    const body = skill(lang);
    assert.match(
      body,
      /\$\{CLAUDE_SKILL_DIR\}\/references\/plan-distribution\.md/,
      `${lang}: Phase 2 sends the distribution to the reference`,
    );
    const reference = at(lang, "skills", "slice", "references", "plan-distribution.md");
    assert.ok(existsSync(reference), `${lang}: the reference is where the path points`);
    // Anchored to the row, not to the word: every one of these names appears in the prose too,
    // so a whole-file search stays green on a table that dropped the row.
    const rows = readFileSync(reference, "utf8")
      .split("\n")
      .filter((line) => line.startsWith("|"));
    for (const element of ["Outcome", "Preconditions", "U-NNN", "Backlog candidates"])
      assert.ok(
        rows.some((row) => row.startsWith(`| ${element}`)),
        `${lang}: the table carries a row for ${element}`,
      );
  }
});

// Build's Revalidate matches every precondition against the current codebase. A precondition
// naming what a sibling slice has yet to write fails there, and "not there yet" reads the same
// as a wrong plan.
test("what a sibling slice creates travels as a dependency, not a precondition", () => {
  for (const lang of langs) {
    // Scoped to the section that states the rule. Both words also appear elsewhere in the file,
    // so a whole-file search would stay green on a section that lost the rule.
    const text = readFileSync(
      at(lang, "skills", "slice", "references", "plan-distribution.md"),
      "utf8",
    );
    const heading = lang === "ja" ? "## 他スライスが作るもの" : "## What a sibling slice creates";
    const section = text.slice(text.indexOf(heading)).split("\n## ")[0];
    assert.ok(section.startsWith(heading), `${lang}: the section stating the rule is present`);
    assert.match(section, /Revalidate/, `${lang}: it names the stage that catches this`);
    assert.match(section, /Blocked by/, `${lang}: it names where the ordering goes instead`);
  }
});

// The prose Parent heading is a copy. Without the gh call the relation exists only in the body,
// where no tooling reads it.
test("the parent-child relation is set through gh, with the heading as its copy", () => {
  for (const lang of langs) {
    const body = skill(lang);
    assert.match(body, /--add-sub-issue/, `${lang}: a step links the slices to the source`);
    assert.match(body, /## Parent/, `${lang}: the body still carries the heading`);
  }
});

// The parent issue is explicitly left unmodified, so a rationale settled in Phase 3 has nowhere
// to live unless the closing report carries it.
test("the deliberate exclusions settled in Phase 3 reach the closing report", () => {
  for (const lang of langs) {
    const phase4 = skill(lang).split("\n## Phase 4")[1];
    assert.ok(phase4, `${lang}: Phase 4 is present`);
    assert.match(
      phase4.split("\n### ")[0],
      lang === "ja" ? /意図的に除外した/ : /deliberately excluded/,
      `${lang}: a step writes the excluded units into the report`,
    );
  }
});
