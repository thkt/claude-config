import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "qualify", "SKILL.md"),
  en: join(root, "skills", "qualify", "SKILL.md"),
};
const buildJs = join(root, "workflows", "build.js");

// Takes the body between two headings. Reused by the Phase 2, Phase 3, and Questions checks.
function sliceSection(doc, head, tail) {
  return doc.slice(doc.indexOf(head), doc.indexOf(tail));
}

// Breaks Phase 3's axis table into cell arrays of [axis, pass condition, severity]. The header row
// and the separator line (---) are left out of the check.
function getPhase3DataRows(doc) {
  const phase3 = sliceSection(doc, "## Phase 3", "## Phase 4");
  const lines = phase3.split("\n").filter((line) => line.trim().startsWith("|"));
  return lines.slice(2).map((line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim()),
  );
}

// Decides, by per-language keywords, whether the row inspecting an added or changed displayed
// domain field states where they are enumerated (the AC and the plan's T-NNN) in its pass
// condition.
const FIELD_ROW_KEYWORDS = {
  ja: [/ドメインフィールド/, /列挙/, /(出典|agent)/i, /\bAC\b/, /T-NNN/],
  en: [/domain field/i, /enumerat/i, /(source|cite)/i, /\bAC\b/, /T-NNN/],
};

// The conditions under which build stops at the Load stage live only in build.js's validate and
// oversizedUnits. Were qualify to copy them, the verdict would go false the moment build alone
// changed. The copy drops nothing at run time, so this static match enforces the single source of
// truth. A copied threshold is worded differently per language (files <= 3 / files 3 個まで), so
// it is detected by the absence of digits rather than by wording. Phase 2 needs no digit beyond
// its step numbering.
test("build's stop conditions are never copied into the skill body", () => {
  assert.match(
    readFileSync(buildJs, "utf8"),
    /const UNIT_CAPS = \{ files: \d+, tests: \d+ \};/,
    "build.js holds UNIT_CAPS as numbers",
  );

  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${path} exists`);
    const doc = readFileSync(path, "utf8");
    const phase2 = sliceSection(doc, "## Phase 2", "## Phase 3");
    assert.ok(phase2.length > 0, `${lang}: Phase 2 is readable`);
    assert.doesNotMatch(
      phase2.replace(/^\d+\.\s/gm, "").replace(/Phase \d/g, ""),
      /\d/,
      `${lang}: no threshold or count is copied into Phase 2`,
    );
    assert.match(doc, /const validate = /, `${lang}: a step locates validate at run time`);
    assert.match(doc, /const oversizedUnits = /, `${lang}: oversizedUnits is among what gets read`);
    assert.match(doc, /workflows\/build\.js/, `${lang}: it states that what to read is build.js`);
  }
});

// The inspection stays read-only. A broad gh grant would hand it the means to post a comment and
// leave "does not post" resting on a prose promise alone.
test("allowed-tools stays closed to reading the issue", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const tools = (readFileSync(path, "utf8").match(/^allowed-tools:.*$/m) || [""])[0];
    assert.match(tools, /Bash\(gh issue view:\*\)/, `${lang}: gh is limited to issue view`);
    assert.doesNotMatch(tools, /Bash\(gh:\*\)/, `${lang}: gh as a whole is not granted`);
    assert.doesNotMatch(tools, /Write|Edit/, `${lang}: the inspection holds no means of writing`);
  }
});

// The verdict takes three values, with needs-plan first. Listing other findings on an issue with
// no Plan section does not change whether to start, so a broken decision order misreads it as
// needs-fix.
test("the three verdict values and their decision order match across both languages", () => {
  const VERDICTS = ["needs-plan", "needs-fix", "build-ready"];
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const order = VERDICTS.map((v) => doc.indexOf(`| ${v}`));
    for (const [i, at] of order.entries()) {
      assert.ok(at >= 0, `${lang}: the verdict table carries a ${VERDICTS[i]} row`);
    }
    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      order,
      `${lang}: the verdict table runs needs-plan, needs-fix, build-ready in order`,
    );
  }
});

// An issue with no Plan section pins the verdict to needs-plan through Phase 2's early exit, but a
// Bug must have its cause pinned down first and its next move differs from the other types.
// Without this branch, what to do next drops out of a needs-plan Bug issue.
test("each language's SKILL.md carries the rule of checking a Bug's stated cause even under needs-plan", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const phase2 = sliceSection(doc, "## Phase 2", "## Phase 3");
    assert.match(phase2, /Bug/, `${lang}: Phase 2 carries Bug as a branch condition`);
    assert.match(
      phase2,
      lang === "ja" ? /原因/ : /root cause/i,
      `${lang}: Phase 2 carries the rule of checking a Bug's stated cause`,
    );
  }
});

// The contract is that the early-exit reason reads as "it does not change whether to start, but it
// changes the next move". Digits are delegated to build.js, and mixing them into this section
// breaks the single source of truth.
test("it clears the existing check that no digit remains in the Phase 2 section", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const phase2 = sliceSection(doc, "## Phase 2", "## Phase 3");
    assert.doesNotMatch(
      phase2.replace(/^\d+\.\s/gm, "").replace(/Phase \d/g, ""),
      /\d/,
      `${lang}: no digit remains in Phase 2`,
    );
  }
});

// An issue adding or changing a displayed field needs a blocker row inspecting whether the field
// is enumerated, or whether a source the agent can read is cited. A UI issue leaving the fields
// unchanged does not match this row and passes without it firing.
test("each language's SKILL.md carries a displayed-field row at severity blocker in its axis table", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const fieldRow = getPhase3DataRows(doc).find((cells) =>
      FIELD_ROW_KEYWORDS[lang].every((re) => re.test(cells[1])),
    );
    assert.ok(
      fieldRow,
      `${lang}: Phase 3's axis table carries a row inspecting an added or changed displayed field, whose pass condition names the enumeration into the AC and T-NNN`,
    );
    assert.equal(
      fieldRow[2],
      "blocker",
      `${lang}: an issue missing the displayed-field enumeration stops as a blocker`,
    );
  }
});

// Adding or dropping a row happens in both languages at once, per MIRROR.md. Changing one side
// alone breaks the mirror. Whether a particular row exists is pinned by the tests above; counting
// against a fixed baseline instead broke whenever an unrelated row was retired.
test("the axis table row count matches across both languages", () => {
  const counts = {};
  for (const [lang, path] of Object.entries(skills)) {
    counts[lang] = getPhase3DataRows(readFileSync(path, "utf8")).length;
    assert.ok(counts[lang] > 0, `${lang}: Phase 3's axis table is readable`);
  }
  assert.equal(counts.ja, counts.en, "the axis table row count matches across both languages");
});

// The questions come through AskUserQuestion after the verdict, blockers, and advice have all been
// written out as text. A broken order makes the user choose without having seen the verdict. And
// since qualify never rewrites the issue body, reading an answered blocker as resolved would flip
// a needs-fix issue to build-ready and build would stop on the same condition.
test("the Questions section names AskUserQuestion and the rules table states the verdict does not change", () => {
  const SECTION = { ja: ["### 質問", "## ルール"], en: ["### Questions", "## Rules"] };
  const VERDICT_RULE = {
    ja: /verdict は取得した時点の issue 本文/,
    en: /verdict comes from the issue body as fetched/i,
  };
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const [head, tail] = SECTION[lang];
    const section = sliceSection(doc, head, tail);
    assert.ok(section.length > 0, `${lang}: the Questions section is readable`);
    assert.match(section, /AskUserQuestion/, `${lang}: the questions come through AskUserQuestion`);
    assert.match(section, /multiSelect/, `${lang}: it states when multiSelect applies`);
    assert.match(
      doc.slice(doc.indexOf(tail)),
      VERDICT_RULE[lang],
      `${lang}: the rules table carries the rule that the verdict comes from the body`,
    );
  }
});
