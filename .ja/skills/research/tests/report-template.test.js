// /research の結合はすべてファイル間にある。Phase 番号はテンプレートが SKILL.md の見出しを
// 引用し、triage の「記録のみ」は /think が plan スコープの判定に読み、検証手順は SKILL.md が
// verification.md の見出しを名前で指す。いずれも片側を変えても実行時には何も落ちないので、
// この静的照合が同一コミットでの追従を強制する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
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
  assert.ok(existsSync(path), `${path} が存在する`);
  return readFileSync(path, "utf8");
}

test("テンプレートが引用する Phase 番号がすべて SKILL.md の見出しに存在する", () => {
  for (const lang of LANGS) {
    const headings = new Set(
      [...read(skills[lang]).matchAll(/^## Phase (\d+)/gm)].map((m) => m[1]),
    );
    assert.ok(headings.size >= 5, `${lang}: SKILL.md が Phase 見出しを 5 つ以上持つ`);
    const cited = new Set([...read(templates[lang]).matchAll(/Phase (\d+)/g)].map((m) => m[1]));
    assert.ok(cited.size >= 5, `${lang}: テンプレートが Phase を 5 つ以上引用する`);
    for (const n of [...cited].sort()) {
      assert.ok(headings.has(n), `${lang}: テンプレートが引用する Phase ${n} が SKILL.md にある`);
    }
  }
});

// /think は「次のアクションが記録のみ」の finding を plan スコープから外す。語が 3 ファイルで
// 揃っていないと、research が記録のみと書いた finding を think が拾い、スコープが膨らむ。
const TRIAGE_LITERAL = { ja: "記録のみ", en: "record only" };

test("triage の記録のみ literal が research SKILL / テンプレート / think SKILL で一致する", () => {
  for (const lang of LANGS) {
    const needle = TRIAGE_LITERAL[lang];
    const sites = [
      ["research SKILL.md", skills[lang]],
      ["research テンプレート", templates[lang]],
      ["think SKILL.md", thinkSkills[lang]],
    ];
    for (const [name, path] of sites) {
      assert.ok(read(path).includes(needle), `${lang}: ${name} が ${needle} を書いている`);
    }
  }
});

// SKILL.md は検証手順を verification.md の見出し名で指す。見出しを改名すると参照が空を指す。
const VERIFICATION_HEADINGS = {
  ja: ["Cross-method 検証", "一次ソース検証", "Same-origin sweep"],
  en: ["Cross-method verification", "Primary-source verification", "Same-origin sweep"],
};

test("SKILL.md が名前で指す verification.md の見出しが実在する", () => {
  for (const lang of LANGS) {
    const ver = read(verifications[lang]);
    const skill = read(skills[lang]);
    for (const heading of VERIFICATION_HEADINGS[lang]) {
      assert.ok(
        ver.includes(`## ${heading}`),
        `${lang}: verification.md に ${heading} 見出しがある`,
      );
      assert.ok(skill.includes(heading), `${lang}: SKILL.md が ${heading} を名前で指す`);
    }
  }
});

// Phase 2 が代わりにスクリプトを呼ぶ (ADR: .ja/skills/outcome/SKILL.md の呼び出し形に倣う)。
// 名指しされたスクリプトが実在せず実行もできなければ、Phase 2 の指示は絵に描いた餅になる。
function extractPhase(skillText, n) {
  const re = new RegExp(`^## Phase ${n}[\\s\\S]*?(?=^## Phase ${n + 1})`, "m");
  return skillText.match(re)?.[0] ?? "";
}

test("SKILL.md の Phase 2 が名指しするスクリプトが実在し実行して JSON を返す", () => {
  for (const lang of LANGS) {
    const skill = read(skills[lang]);
    const phase2 = extractPhase(skill, 2);
    assert.ok(phase2.length > 0, `${lang}: Phase 2 セクションが存在する`);
    const scriptMatch = phase2.match(/\$\{CLAUDE_SKILL_DIR\}\/scripts\/([\w.-]+\.py)/);
    assert.ok(
      scriptMatch,
      `${lang}: Phase 2 が \${CLAUDE_SKILL_DIR}/scripts/ 配下のスクリプトを名指しする`,
    );
    const scriptPath = join(dirname(skills[lang]), "scripts", scriptMatch[1]);
    assert.ok(existsSync(scriptPath), `${lang}: 名指しされたスクリプト ${scriptPath} が実在する`);
    const result = spawnSync(
      "python3",
      [scriptPath, "dummy-slug", join(root, "does-not-exist-dir")],
      { encoding: "utf8" },
    );
    assert.strictEqual(result.status, 0, `${lang}: スクリプトが exit 0 で終了する`);
    let parsed = null;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(result.stdout);
    }, `${lang}: スクリプトの標準出力が JSON としてパースできる`);
    assert.ok(parsed && typeof parsed === "object", `${lang}: JSON が object を返す`);
  }
});

test("allowed-tools が research の scripts 配下の実行を許可する", () => {
  for (const lang of LANGS) {
    const skill = read(skills[lang]);
    const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    const allowedToolsLine = frontmatter.match(/^allowed-tools:\s*(.+)$/m)?.[1] ?? "";
    assert.ok(
      /Bash\(\$HOME\/\.claude\/skills\/research\/scripts\/\*\)/.test(allowedToolsLine),
      `${lang}: allowed-tools が Bash($HOME/.claude/skills/research/scripts/*) を許可する`,
    );
  }
});

const SHARED_ONE_KEYWORDS = {
  ja: { landing: "References", exclusion: "対象外" },
  en: { landing: "References", exclusion: "excluded" },
};

test("SKILL.md の Phase 2 が共有 1 件のヒットを Constraints 引き継ぎ表の対象外と定める", () => {
  for (const lang of LANGS) {
    const skill = read(skills[lang]);
    const phase2 = extractPhase(skill, 2);
    assert.ok(phase2.length > 0, `${lang}: Phase 2 セクションが存在する`);
    assert.ok(
      /shared["']?\s*(:|=|==)?\s*1\b/.test(phase2),
      `${lang}: Phase 2 が shared 1 件のケースに言及する`,
    );
    const { landing, exclusion } = SHARED_ONE_KEYWORDS[lang];
    assert.ok(
      phase2.includes(exclusion),
      `${lang}: Phase 2 が Constraints 引き継ぎ表の対象外である旨を定める`,
    );
    assert.ok(phase2.includes(landing), `${lang}: Phase 2 が References を着地先として名指しする`);
  }
});
