import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "qualify", "SKILL.md"),
  en: join(root, "skills", "qualify", "SKILL.md"),
};
const buildJs = join(root, "workflows", "build.js");
const QUESTIONS_SECTION = { ja: ["### 質問", "## ルール"], en: ["### Questions", "## Rules"] };

// A loop that visited neither language would pass every caller without having read anything.
function eachSkill(check) {
  const seen = [];
  for (const [lang, path] of Object.entries(skills)) {
    check(readFileSync(path, "utf8"), lang);
    seen.push(lang);
  }
  assert.deepEqual(seen, ["ja", "en"], "both language files were inspected");
}

function sliceSection(doc, head, tail) {
  return doc.slice(doc.indexOf(head), doc.indexOf(tail));
}

const phase2Of = (doc) => sliceSection(doc, "## Phase 2", "## Phase 3");

// The header and the separator row would answer a keyword search as if they were axes.
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

// Matching by keyword rather than by row position keeps an inserted row from moving the check onto
// another axis.
const FIELD_ROW_KEYWORDS = {
  ja: [/ドメインフィールド/, /列挙/, /(出典|agent)/i, /\bAC\b/, /T-NNN/],
  en: [/domain field/i, /enumerat/i, /(source|cite)/i, /\bAC\b/, /T-NNN/],
};

// A copy of build's thresholds goes stale the moment build alone changes. The wording differs per
// language (files <= 3 / files 3 個まで), so a copy is caught as a digit rather than as a phrase.
// Pinning the skill side alone would let a rename inside build.js empty the ugrep silently.
test("build's stop conditions are never copied into the skill body", () => {
  const buildSource = readFileSync(buildJs, "utf8");
  assert.match(
    buildSource,
    /const UNIT_CAPS = \{ files: \d+, tests: \d+ \};/,
    "build.js holds UNIT_CAPS as numbers",
  );
  assert.match(buildSource, /^const validate = /m, "build.js holds validate under that name");
  assert.match(
    buildSource,
    /^const oversizedUnits = /m,
    "build.js holds oversizedUnits under that name",
  );

  eachSkill((doc, lang) => {
    const phase2 = phase2Of(doc);
    assert.ok(phase2.length > 0, `${lang}: Phase 2 is readable`);
    assert.doesNotMatch(
      phase2.replace(/^\d+\.\s/gm, "").replace(/Phase \d/g, ""),
      /\d/,
      `${lang}: no threshold or count is copied into Phase 2`,
    );
    assert.match(doc, /const validate = /, `${lang}: a step locates validate at run time`);
    assert.match(doc, /const oversizedUnits = /, `${lang}: oversizedUnits is among what gets read`);
    assert.match(doc, /workflows\/build\.js/, `${lang}: it states that what to read is build.js`);
  });
});

// A broad gh grant would leave "posts nothing" resting on a prose promise.
test("allowed-tools stays closed to reading the issue", () => {
  eachSkill((doc, lang) => {
    const tools = (doc.match(/^allowed-tools:.*$/m) || [""])[0];
    assert.match(tools, /Bash\(gh issue view:\*\)/, `${lang}: gh is limited to issue view`);
    assert.match(
      tools,
      /Bash\(gh repo view:\*\)/,
      `${lang}: reading the local repository name is granted`,
    );
    assert.doesNotMatch(tools, /Bash\(gh:\*\)/, `${lang}: gh as a whole is not granted`);
    assert.doesNotMatch(tools, /Write|Edit/, `${lang}: the inspection holds no means of writing`);
  });
});

// An unapplied plan contract raises no violation, and no violation reads as build-ready.
test("an anchor that goes unmatched stops the inspection instead of reading as no violation", () => {
  const STOP = { ja: [/いずれかがヒットしなければ/, /停止/], en: [/goes unmatched/i, /\bstop\b/i] };
  eachSkill((doc, lang) => {
    for (const re of STOP[lang]) {
      assert.match(phase2Of(doc), re, `${lang}: Phase 2 stops when an anchor goes unmatched`);
    }
  });
});

// build.js checks the ids for duplicates alone, so U-001 then U-003 passes Load; a gap raised as a
// blocker would hold back an issue build takes.
test("a gap between ids is left uninspected rather than raised as a blocker", () => {
  const GAP = {
    ja: { stated: /欠番.*検分しない/, denied: /欠番.*blocker/ },
    en: { stated: /gap is not among the conditions/i, denied: /gaps are blockers/i },
  };
  eachSkill((doc, lang) => {
    const phase2 = phase2Of(doc);
    assert.match(phase2, GAP[lang].stated, `${lang}: a gap is stated as uninspected`);
    assert.doesNotMatch(phase2, GAP[lang].denied, `${lang}: a gap is not a blocker`);
  });
});

// gh issue view takes a URL from any repository, and Creation collision carries severity blocker,
// so matching unrelated code puts out a needs-fix the body never earned.
test("the axes that read code are left uninspected when the issue's repository is not the local one", () => {
  const MISMATCH = {
    ja: [/gh repo view/, /owner\/repo/, /食い違/, /検分しない/],
    en: [/gh repo view/, /owner\/repo/, /differ/i, /uninspected/i],
  };
  eachSkill((doc, lang) => {
    for (const re of MISMATCH[lang]) {
      assert.match(doc, re, `${lang}: the repository match and what it withholds are stated`);
    }
  });
});

// Listing other findings on an issue with no Plan section does not change whether to start, so a
// broken decision order misreads it as needs-fix.
test("the three verdict values and their decision order match across both languages", () => {
  const VERDICTS = ["needs-plan", "needs-fix", "build-ready"];
  eachSkill((doc, lang) => {
    const order = VERDICTS.map((v) => doc.indexOf(`| ${v}`));
    for (const [i, at] of order.entries()) {
      assert.ok(at >= 0, `${lang}: the verdict table carries a ${VERDICTS[i]} row`);
    }
    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      order,
      `${lang}: the verdict table runs needs-plan, needs-fix, build-ready in order`,
    );
  });
});

// A plan-less issue carries no contract for the other axes to read, and criteria left unverifiable
// here become what /think designs the plan against.
test("an issue with no Plan section still has its acceptance criteria inspected", () => {
  const EARLY_EXIT = {
    ja: [/AC の検証可能性だけ/, /新規作成の衝突と表示フィールドの列挙/],
    en: [/Verifiable criteria alone/, /Creation collision and Displayed field enumeration/],
  };
  eachSkill((doc, lang) => {
    for (const re of EARLY_EXIT[lang]) {
      assert.match(
        phase2Of(doc),
        re,
        `${lang}: needs-plan inspects the criteria and states what it skips`,
      );
    }
  });
});

// qualify holds no Write, so an answer that stops at the next-step line never reaches the body.
test("an answer comes back as a proposal for rewriting the body", () => {
  const PROPOSAL = {
    ja: [/案にして返す/, /書き換えない/],
    en: [/as a proposal/i, /never rewrites the body/i],
  };
  eachSkill((doc, lang) => {
    const [head, tail] = QUESTIONS_SECTION[lang];
    const section = sliceSection(doc, head, tail);
    for (const re of PROPOSAL[lang]) {
      assert.match(section, re, `${lang}: an answer comes back as a proposal for the body`);
    }
  });
});

// Without this branch a needs-plan Bug issue loses what to do next, since its cause has to be
// pinned down before a plan can exist.
test("each language's SKILL.md carries the rule of checking a Bug's stated cause even under needs-plan", () => {
  eachSkill((doc, lang) => {
    const phase2 = phase2Of(doc);
    assert.match(phase2, /Bug/, `${lang}: Phase 2 carries Bug as a branch condition`);
    assert.match(
      phase2,
      lang === "ja" ? /原因/ : /root cause/i,
      `${lang}: Phase 2 carries the rule of checking a Bug's stated cause`,
    );
  });
});

// Making the row unconditional would fail every UI issue that leaves the displayed fields as they
// are.
test("each language's SKILL.md carries a displayed-field row at severity blocker in its axis table", () => {
  eachSkill((doc, lang) => {
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
  });
});

// A count against a fixed baseline broke whenever an unrelated row was retired, so the languages
// are counted against each other instead.
test("the axis table row count matches across both languages", () => {
  const counts = {};
  eachSkill((doc, lang) => {
    counts[lang] = getPhase3DataRows(doc).length;
    assert.ok(counts[lang] > 0, `${lang}: Phase 3's axis table is readable`);
  });
  assert.equal(counts.ja, counts.en, "the axis table row count matches across both languages");
});

// A broken order makes the user choose before seeing the verdict. And since qualify never rewrites
// the body, reading an answered blocker as resolved would flip needs-fix to build-ready while build
// stops on the same condition.
test("the Questions section names AskUserQuestion and the rules table states the verdict does not change", () => {
  const VERDICT_RULE = {
    ja: /verdict は取得した時点の issue 本文/,
    en: /verdict comes from the issue body as fetched/i,
  };
  eachSkill((doc, lang) => {
    const [head, tail] = QUESTIONS_SECTION[lang];
    const section = sliceSection(doc, head, tail);
    assert.ok(section.length > 0, `${lang}: the Questions section is readable`);
    assert.match(section, /AskUserQuestion/, `${lang}: the questions come through AskUserQuestion`);
    assert.match(section, /multiSelect/, `${lang}: it states when multiSelect applies`);
    assert.match(
      doc.slice(doc.indexOf(tail)),
      VERDICT_RULE[lang],
      `${lang}: the rules table carries the rule that the verdict comes from the body`,
    );
  });
});
