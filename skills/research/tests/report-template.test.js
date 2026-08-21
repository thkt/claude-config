// A mismatch between any two of these files drops nothing at run time, so only a static match
// forces both sides to follow in the same commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LANGS = ["ja", "en"];
const at = (lang, ...parts) => join(root, ...(lang === "ja" ? [".ja"] : []), ...parts);
const skillPath = (lang) => at(lang, "skills", "research", "SKILL.md");
const templatePath = (lang) => at(lang, "skills", "research", "templates", "research.md");
const verificationPath = (lang) => at(lang, "skills", "research", "references", "verification.md");
// The table naming the report's parts lives here. A check aimed at the skill body would find
// only the line that delegates.
const thinkPath = (lang) => at(lang, "skills", "think", "references", "research-report-intake.md");

function read(path) {
  assert.ok(existsSync(path), `${path} exists`);
  return readFileSync(path, "utf8");
}

function extractPhase(skillText, n) {
  const re = new RegExp(`^## Phase ${n}[\\s\\S]*?(?=^## Phase ${n + 1})`, "m");
  return skillText.match(re)?.[0] ?? "";
}

const phaseOf = (lang, n) => extractPhase(read(skillPath(lang)), n);

// Takes the first table at or after the heading. An omitted heading scans from the start, which is
// how a section already sliced out of the skill gets read.
function tableUnder(doc, heading = "") {
  const lines = doc.slice(doc.indexOf(heading)).split("\n");
  const first = lines.findIndex((l) => l.startsWith("|"));
  let last = first;
  while (lines[last + 1]?.startsWith("|")) last += 1;
  return lines.slice(first + 2, last + 1).map((l) =>
    l
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim()),
  );
}

test("every Phase number the template cites exists as a heading in SKILL.md", () => {
  for (const lang of LANGS) {
    const headings = new Set(
      [...read(skillPath(lang)).matchAll(/^## Phase (\d+)/gm)].map((m) => m[1]),
    );
    assert.ok(headings.size >= 5, `${lang}: SKILL.md carries five or more Phase headings`);
    const cited = new Set([...read(templatePath(lang)).matchAll(/Phase (\d+)/g)].map((m) => m[1]));
    assert.ok(cited.size >= 5, `${lang}: the template cites five or more Phases`);
    for (const n of [...cited].sort()) {
      assert.ok(headings.has(n), `${lang}: Phase ${n}, cited by the template, exists in SKILL.md`);
    }
  }
});

// /think drops a finding whose next action is "record only" from the plan scope. Without the same
// wording across all three files, think picks up a finding research marked record-only and the
// scope swells.
const TRIAGE_LITERAL = { ja: "記録のみ", en: "record only" };

test("triage's record-only literal matches across research SKILL, the template, and think SKILL", () => {
  for (const lang of LANGS) {
    const needle = TRIAGE_LITERAL[lang];
    const sites = [
      ["research SKILL.md", skillPath(lang)],
      ["the research template", templatePath(lang)],
      ["think SKILL.md", thinkPath(lang)],
    ];
    for (const [name, path] of sites) {
      assert.ok(read(path).includes(needle), `${lang}: ${name} writes ${needle}`);
    }
  }
});

// think decides plan scope by these section names. Renaming one in the template leaves think's
// table pointing at a section no report carries, and a report section with no entry in that table
// is not plan material, so the part goes unread with nothing failing.
const CONSUMED_SECTIONS = {
  ja: ["制約", "仮説ログ", "Same-origin Sweep", "カバレッジ注記"],
  en: ["Constraints", "Hypotheses Log", "Same-origin Sweep", "Coverage Notes"],
};

test("every report section think reads exists as a heading in the template", () => {
  for (const lang of LANGS) {
    const template = read(templatePath(lang));
    // Phase 1 names the Hypotheses Log in the skill body while the rest of the parts sit in the
    // reference, so what think reads spans the two files.
    const think = read(at(lang, "skills", "think", "SKILL.md")) + read(thinkPath(lang));
    for (const section of CONSUMED_SECTIONS[lang]) {
      // \b takes an ASCII word character on one side, which a Japanese heading never offers.
      assert.match(
        template,
        new RegExp(`^## ${section}( |$)`, "m"),
        `${lang}: the template carries the ${section} section`,
      );
      // Anchored to the row, not the word: several of these names also appear in surrounding
      // prose, so a whole-file search stays green on a table that dropped the row.
      const named =
        think.split("\n").some((line) => line.startsWith(`| ${section}`)) ||
        think.includes(`\`${section}\``);
      assert.ok(named, `${lang}: think takes ${section} in a row or names it as a literal`);
    }
  }
});

// think pulls the report by a slug it builds from the task's words. Handing the report over without
// those words leaves think deriving its own, and a report the slug misses reads as no research at
// all. The destinations live in the template alone, so the body points at that table.
const HANDOFF_WORDS = { ja: /slug の元になった語/, en: /the words the slug came from/ };

test("the output phase hands the report over through the template's Next Steps table", () => {
  for (const lang of LANGS) {
    const skill = read(skillPath(lang));
    const phase8 = skill.slice(
      skill.indexOf("## Phase 8"),
      skill.indexOf(COMPLETION_HEADING[lang]),
    );
    assert.ok(phase8.length > 0, `${lang}: the Phase 8 section is readable`);
    assert.ok(phase8.includes("Next Steps"), `${lang}: Phase 8 points at the Next Steps table`);
    assert.match(phase8, HANDOFF_WORDS[lang], `${lang}: it attaches the words the slug came from`);
    const template = read(templatePath(lang));
    const nextSteps = template.slice(template.indexOf("## Next Steps"));
    assert.ok(nextSteps.includes("/think"), `${lang}: the Next Steps table routes to /think`);
  }
});

// A finding research could not verify carries this source. Without the same wording on both sides,
// think grounds a plan on it as though it were confirmed.
const UNVERIFIED_LITERAL = "unknown, requires";

test("the unverified-source literal matches across research SKILL and think SKILL", () => {
  for (const lang of LANGS) {
    for (const [name, path] of [
      ["research SKILL.md", skillPath(lang)],
      ["think SKILL.md", thinkPath(lang)],
    ]) {
      assert.ok(
        read(path).includes(UNVERIFIED_LITERAL),
        `${lang}: ${name} writes ${UNVERIFIED_LITERAL}`,
      );
    }
  }
});

// think locating the report by eye and research locating one by script are the same judgement, and
// only the script one is repeatable. A grant that does not cover the path leaves the call refused.
test("think runs research's finder script and is granted the path it names", () => {
  for (const lang of LANGS) {
    // The call and the grant sit in the skill body, not in the reference the table moved to.
    const think = read(at(lang, "skills", "think", "SKILL.md"));
    const call = think.match(/\$\{CLAUDE_SKILL_DIR\}\/\.\.\/research\/scripts\/([\w.-]+\.py)/);
    assert.ok(call, `${lang}: think names research's script under \${CLAUDE_SKILL_DIR}`);
    assert.ok(
      existsSync(join(dirname(skillPath(lang)), "scripts", call[1])),
      `${lang}: the named script exists under research`,
    );
    const allowed = think.match(/^allowed-tools:\s*(.+)$/m)?.[1] ?? "";
    assert.match(
      allowed,
      /Bash\(\$\{CLAUDE_SKILL_DIR\}\/\.\.\/research\/scripts\/\*\)/,
      `${lang}: allowed-tools grants running it by the same path`,
    );
  }
});

// The domain table left the body so a General run never reads it. Phase 3 still has to offer the
// domain names to ask the question with, and the reference has to carry a row per name it offers,
// or a chosen domain scopes nothing.
const SCOPED_DOMAINS = ["Data model", "API", "Infrastructure"];

test("every domain Phase 3 offers carries a row in the domain-scope reference", () => {
  for (const lang of LANGS) {
    const phase3 = phaseOf(lang, 3);
    const reference = read(at(lang, "skills", "research", "references", "domain-scope.md"));
    for (const domain of [...SCOPED_DOMAINS, "General"]) {
      assert.ok(phase3.includes(domain), `${lang}: Phase 3 offers ${domain}`);
    }
    for (const domain of SCOPED_DOMAINS) {
      assert.match(
        reference,
        new RegExp(`^\\| ${domain}\\s`, "m"),
        `${lang}: domain-scope.md carries a row for ${domain}`,
      );
    }
    // General means no scoping, so a row for it would name roots the run must not apply.
    assert.doesNotMatch(reference, /^\| General\s/m, `${lang}: General carries no row`);
    assert.ok(
      phaseOf(lang, 4).includes("references/domain-scope.md"),
      `${lang}: Phase 4 reads the reference`,
    );
  }
});

// SKILL.md names the verification steps by verification.md's heading names. Renaming a heading
// leaves the reference pointing at nothing.
const VERIFICATION_HEADINGS = {
  ja: ["Cross-method 検証", "一次ソース検証", "Same-origin sweep"],
  en: ["Cross-method verification", "Primary-source verification", "Same-origin sweep"],
};

test("every verification.md heading SKILL.md names exists", () => {
  for (const lang of LANGS) {
    const ver = read(verificationPath(lang));
    const skill = read(skillPath(lang));
    for (const heading of VERIFICATION_HEADINGS[lang]) {
      assert.ok(
        ver.includes(`## ${heading}`),
        `${lang}: verification.md carries the ${heading} heading`,
      );
      assert.ok(skill.includes(heading), `${lang}: SKILL.md names ${heading}`);
    }
  }
});

// A named script that neither exists nor runs leaves Phase 2's instruction with nothing behind it.
test("the script Phase 2 names exists, runs, and returns a JSON object", () => {
  for (const lang of LANGS) {
    const phase2 = phaseOf(lang, 2);
    assert.ok(phase2.length > 0, `${lang}: the Phase 2 section exists`);
    const scriptMatch = phase2.match(/\$\{CLAUDE_SKILL_DIR\}\/scripts\/([\w.-]+\.py)/);
    assert.ok(scriptMatch, `${lang}: Phase 2 names a script under \${CLAUDE_SKILL_DIR}/scripts/`);
    const scriptPath = join(dirname(skillPath(lang)), "scripts", scriptMatch[1]);
    assert.ok(existsSync(scriptPath), `${lang}: the named script ${scriptPath} exists`);
    const result = spawnSync(
      "python3",
      [scriptPath, "dummy-slug", join(root, "does-not-exist-dir")],
      {
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, `${lang}: the script exits 0`);
    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed && typeof parsed === "object", `${lang}: stdout parses as a JSON object`);
  }
});

test("allowed-tools grants running the scripts under research", () => {
  for (const lang of LANGS) {
    const frontmatter = read(skillPath(lang)).match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    const allowedToolsLine = frontmatter.match(/^allowed-tools:\s*(.+)$/m)?.[1] ?? "";
    assert.match(
      allowedToolsLine,
      /Bash\(\$\{CLAUDE_SKILL_DIR\}\/scripts\/\*\)/,
      `${lang}: allowed-tools grants the scripts through \${CLAUDE_SKILL_DIR}`,
    );
    // A home-anchored grant names the dev tree, which a plugin copy of the skill never matches.
    assert.doesNotMatch(allowedToolsLine, /\$HOME|~\//, `${lang}: no hardcoded home path`);
  }
});

// Placed as a step inside a Phase, the notation every Phase and the template follow reads as a
// procedure belonging to that one Phase. Placed after its first use, it becomes a forward
// reference the reader has to jump for.
const SOURCE_NOTATION = { ja: "ソース記法", en: "Source notation" };

test("the source notation is a top-level section standing before the Phases", () => {
  for (const lang of LANGS) {
    const skill = read(skillPath(lang));
    const heading = SOURCE_NOTATION[lang];
    assert.match(skill, new RegExp(`^## ${heading}$`, "m"), `${lang}: it is a top-level section`);
    assert.doesNotMatch(
      skill,
      new RegExp(`^### ${heading}$`, "m"),
      `${lang}: it is not a step inside a Phase`,
    );
    assert.ok(
      skill.indexOf(`## ${heading}`) < skill.indexOf("## Phase 1"),
      `${lang}: it stands before the Phase that first writes a source`,
    );
  }
});

// A sequential step left outside the Phase numbering drops out of the template's Phase-citation
// check, so a rename there stops failing anything.
test("the output step carries a Phase number", () => {
  for (const lang of LANGS) {
    assert.match(read(skillPath(lang)), /^## Phase 8: /m, `${lang}: the output step is Phase 8`);
  }
});

// The completion table demands Cross-method and primary-source verification on every run. Sharing
// a paragraph with the Feature planning / Bug investigation trigger reads the verification as
// conditional too, and an Understanding run then skips what the table still demands.
const ALWAYS_RUN = { ja: /よらず/, en: /whatever the intent/i };

test("the verification read stands outside the intent-conditional paragraph", () => {
  for (const lang of LANGS) {
    const phase4 = phaseOf(lang, 4);
    assert.ok(phase4.length > 0, `${lang}: the Phase 4 section exists`);
    const paragraph = phase4.split(/\n{2,}/).find((p) => p.includes("references/verification.md"));
    assert.ok(paragraph, `${lang}: Phase 4 names verification.md`);
    assert.doesNotMatch(
      paragraph,
      /Feature planning/,
      `${lang}: the verification read carries no intent condition`,
    );
    assert.match(paragraph, ALWAYS_RUN[lang], `${lang}: it states the read happens on every run`);
  }
});

// The completion table accepts the Prior research field as a slug or as this literal. A second
// wording in Phase 2 puts the field outside that set through the regular procedure.
const NO_PRIOR_LITERAL = "none found";

test("the no-candidate literal matches across Phase 2, the template, and the completion table", () => {
  for (const lang of LANGS) {
    const skill = read(skillPath(lang));
    const phase2 = extractPhase(skill, 2);
    assert.ok(phase2.includes(NO_PRIOR_LITERAL), `${lang}: Phase 2 writes ${NO_PRIOR_LITERAL}`);
    assert.doesNotMatch(
      phase2,
      /No prior research found/,
      `${lang}: Phase 2 carries no second wording for the same state`,
    );
    assert.ok(
      read(templatePath(lang)).includes(NO_PRIOR_LITERAL),
      `${lang}: the template writes ${NO_PRIOR_LITERAL}`,
    );
    assert.ok(
      skill.slice(skill.indexOf("Prior research")).includes(NO_PRIOR_LITERAL),
      `${lang}: the completion table writes ${NO_PRIOR_LITERAL}`,
    );
  }
});

// Stating a condition in both the Phase and the table leaves a one-sided edit failing nothing at
// run time. The Phase column earns its place only while every row points at a Phase that exists.
const COMPLETION_HEADING = { ja: "## 完了条件", en: "## Completion Criteria" };

test("every completion row names the Phase that owns its condition", () => {
  for (const lang of LANGS) {
    const skill = read(skillPath(lang));
    const phases = new Set([...skill.matchAll(/^## Phase (\d+)/gm)].map((m) => m[1]));
    const rows = tableUnder(skill, COMPLETION_HEADING[lang]);
    assert.ok(rows.length >= 8, `${lang}: the completion table carries its rows`);
    for (const [item, phase] of rows) {
      const n = phase.match(/^Phase (\d+)$/)?.[1];
      assert.ok(n, `${lang}: the ${item} row names a Phase in its own column`);
      assert.ok(phases.has(n), `${lang}: the ${item} row points at an existing Phase ${n}`);
    }
  }
});

// A skip condition no Phase produces a state for cannot be judged, so it decides nothing and the
// advisor runs every time.
const SKIP_CONDITION = {
  ja: { checkable: /Phase 4 の発見事項/, vague: /引き継ぎのみ/ },
  en: { checkable: /no Phase 4 finding/i, vague: /inherits only/i },
};

test("the advisor skip condition names a state Phase 4 produces", () => {
  for (const lang of LANGS) {
    const phase6 = phaseOf(lang, 6);
    assert.ok(phase6.length > 0, `${lang}: the Phase 6 section exists`);
    assert.match(phase6, SKIP_CONDITION[lang].checkable, `${lang}: the condition is checkable`);
    assert.doesNotMatch(phase6, SKIP_CONDITION[lang].vague, `${lang}: no unjudgeable wording`);
  }
});

// Prior research of another Domain looked at other roots, so feeding its constraints in as-is
// leaves the current Domain's own constraints undiscovered.
const DOMAIN_GUARD = { ja: /Domain が現在の Domain/, en: /Domain matches the current one/ };

test("the carried-over constraints hold only while the Domain matches", () => {
  for (const lang of LANGS) {
    const phase2 = phaseOf(lang, 2);
    const row = tableUnder(phase2).find((cells) => /Constraints/.test(cells[0]));
    assert.ok(row, `${lang}: Phase 2 carries the Constraints row`);
    assert.match(
      row[2],
      DOMAIN_GUARD[lang],
      `${lang}: the row conditions the carry-over on Domain`,
    );
  }
});

// Carrying a hit that shares one filename word would feed Phase 4 the constraints of research that
// only happens to share a word.
const SHARED_ONE_EXCLUSION = { ja: "対象外", en: "excluded" };

test("SKILL.md's Phase 2 puts a hit sharing one word outside the Constraints carry-over table", () => {
  for (const lang of LANGS) {
    const phase2 = phaseOf(lang, 2);
    assert.ok(phase2.length > 0, `${lang}: the Phase 2 section exists`);
    assert.match(
      phase2,
      /shared["']?\s*(:|=|==)?\s*1\b/,
      `${lang}: Phase 2 names the shared-1 case`,
    );
    assert.ok(
      phase2.includes(SHARED_ONE_EXCLUSION[lang]),
      `${lang}: Phase 2 states it falls outside the Constraints carry-over table`,
    );
    assert.ok(phase2.includes("References"), `${lang}: Phase 2 names References as where it lands`);
  }
});
