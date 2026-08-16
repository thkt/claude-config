// Every coupling in /research runs between files. The template cites SKILL.md's headings for the
// Phase numbers, /think reads triage's "record only" when deciding the plan scope, and SKILL.md
// names verification.md's headings for the verification steps. Changing one side of any of them
// drops nothing at run time, so this static match forces both to follow in the same commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LANGS = ["ja", "en"];
const at = (lang, ...parts) => join(root, ...(lang === "ja" ? [".ja"] : []), ...parts);
const skills = {};
const templates = {};
const verifications = {};
const thinkSkills = {};
for (const lang of LANGS) {
  skills[lang] = at(lang, "skills", "research", "SKILL.md");
  templates[lang] = at(lang, "skills", "research", "templates", "research.md");
  verifications[lang] = at(lang, "skills", "research", "references", "verification.md");
  thinkSkills[lang] = at(lang, "skills", "think", "SKILL.md");
}

function read(path) {
  assert.ok(existsSync(path), `${path} exists`);
  return readFileSync(path, "utf8");
}

test("every Phase number the template cites exists as a heading in SKILL.md", () => {
  for (const lang of LANGS) {
    const headings = new Set(
      [...read(skills[lang]).matchAll(/^## Phase (\d+)/gm)].map((m) => m[1]),
    );
    assert.ok(headings.size >= 5, `${lang}: SKILL.md carries five or more Phase headings`);
    const cited = new Set([...read(templates[lang]).matchAll(/Phase (\d+)/g)].map((m) => m[1]));
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
      ["research SKILL.md", skills[lang]],
      ["the research template", templates[lang]],
      ["think SKILL.md", thinkSkills[lang]],
    ];
    for (const [name, path] of sites) {
      assert.ok(read(path).includes(needle), `${lang}: ${name} writes ${needle}`);
    }
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
    const ver = read(verifications[lang]);
    const skill = read(skills[lang]);
    for (const heading of VERIFICATION_HEADINGS[lang]) {
      assert.ok(
        ver.includes(`## ${heading}`),
        `${lang}: verification.md carries the ${heading} heading`,
      );
      assert.ok(skill.includes(heading), `${lang}: SKILL.md names ${heading}`);
    }
  }
});

// Phase 2 calls the script instead, following the invocation shape in
// .ja/skills/outcome/SKILL.md. A named script that neither exists nor runs leaves Phase 2's
// instruction with nothing behind it.
function extractPhase(skillText, n) {
  const re = new RegExp(`^## Phase ${n}[\\s\\S]*?(?=^## Phase ${n + 1})`, "m");
  return skillText.match(re)?.[0] ?? "";
}

test("the script SKILL.md's Phase 2 names exists, runs, and returns JSON", () => {
  for (const lang of LANGS) {
    const skill = read(skills[lang]);
    const phase2 = extractPhase(skill, 2);
    assert.ok(phase2.length > 0, `${lang}: the Phase 2 section exists`);
    const scriptMatch = phase2.match(/\$\{CLAUDE_SKILL_DIR\}\/scripts\/([\w.-]+\.py)/);
    assert.ok(
      scriptMatch,
      `${lang}: Phase 2 names a script under \${CLAUDE_SKILL_DIR}/scripts/`,
    );
    const scriptPath = join(dirname(skills[lang]), "scripts", scriptMatch[1]);
    assert.ok(existsSync(scriptPath), `${lang}: the named script ${scriptPath} exists`);
    const result = spawnSync(
      "python3",
      [scriptPath, "dummy-slug", join(root, "does-not-exist-dir")],
      { encoding: "utf8" },
    );
    assert.strictEqual(result.status, 0, `${lang}: the script exits 0`);
    let parsed = null;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(result.stdout);
    }, `${lang}: the script's stdout parses as JSON`);
    assert.ok(parsed && typeof parsed === "object", `${lang}: the JSON is an object`);
  }
});

test("allowed-tools grants running the scripts under research", () => {
  for (const lang of LANGS) {
    const skill = read(skills[lang]);
    const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    const allowedToolsLine = frontmatter.match(/^allowed-tools:\s*(.+)$/m)?.[1] ?? "";
    assert.ok(
      /Bash\(\$HOME\/\.claude\/skills\/research\/scripts\/\*\)/.test(allowedToolsLine),
      `${lang}: allowed-tools grants Bash($HOME/.claude/skills/research/scripts/*)`,
    );
  }
});

const SHARED_ONE_KEYWORDS = {
  ja: { landing: "References", exclusion: "対象外" },
  en: { landing: "References", exclusion: "excluded" },
};

test("SKILL.md's Phase 2 puts a hit sharing one word outside the Constraints carry-over table", () => {
  for (const lang of LANGS) {
    const skill = read(skills[lang]);
    const phase2 = extractPhase(skill, 2);
    assert.ok(phase2.length > 0, `${lang}: the Phase 2 section exists`);
    assert.ok(
      /shared["']?\s*(:|=|==)?\s*1\b/.test(phase2),
      `${lang}: Phase 2 mentions the shared-1 case`,
    );
    const { landing, exclusion } = SHARED_ONE_KEYWORDS[lang];
    assert.ok(
      phase2.includes(exclusion),
      `${lang}: Phase 2 states it falls outside the Constraints carry-over table`,
    );
    assert.ok(phase2.includes(landing), `${lang}: Phase 2 names References as the landing place`);
  }
});
