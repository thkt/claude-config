import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "census", "SKILL.md"),
  en: join(root, "skills", "census", "SKILL.md"),
};
const criteria = {
  ja: join(root, ".ja", "skills", "census", "references", "decision-criteria.md"),
  en: join(root, "skills", "census", "references", "decision-criteria.md"),
};
const templates = {
  ja: join(root, ".ja", "skills", "census", "templates", "report-template.md"),
  en: join(root, "skills", "census", "templates", "report-template.md"),
};
const agent = join(root, "agents", "critics", "critic-design.md");

// verdict の語彙は 2 系統ある。keep / downgrade / drop は census が decision-criteria.md で
// 定義する候補の取捨で、confirmed / weakened / needs_revision は critic-design の返り値。
// agent に census 側の語を返させると、agent 定義と Task prompt が競合する。
test("census の取捨語と critic-design の verdict が混ざらない", () => {
  const CENSUS = ["keep", "downgrade", "drop"];
  for (const [lang, path] of Object.entries(criteria)) {
    const doc = readFileSync(path, "utf8");
    for (const word of CENSUS) {
      assert.match(doc, new RegExp(`\`${word}\``), `${lang}: criteria が ${word} を定義する`);
    }
  }
  const verdicts = [
    ...readFileSync(agent, "utf8").matchAll(/^\| (confirmed|weakened|needs_revision) +\|/gm),
  ].map((m) => m[1]);
  assert.equal(verdicts.length, 3, `agent の verdict を 3 つ読める (${verdicts.join(", ")})`);

  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${path} が存在する`);
    const doc = readFileSync(path, "utf8");
    for (const verdict of verdicts) {
      assert.match(doc, new RegExp(verdict), `${lang}: agent の ${verdict} を受ける`);
    }
    assert.doesNotMatch(
      doc,
      /(returns one of `keep`|`keep`\/`downgrade`\/`drop` のいずれかの)/,
      `${lang}: agent に census 側の語を返させていない`,
    );
  }
});

// ${CLAUDE_SKILL_DIR} は skill 本体でしか展開されない。subagent へ渡すと literal のまま届き、
// Read が失敗して判定基準なしで challenge が走る。
test("subagent へ渡すパスが絶対形式", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const spawn = doc.split(/### 5b/)[1] || "";
    assert.ok(spawn.length > 0, `${lang}: Phase 5b を読める`);
    assert.match(
      spawn,
      /~\/\.claude\/skills\/census\/references\/decision-criteria\.md/,
      `${lang}: 絶対パス`,
    );
    assert.doesNotMatch(
      spawn,
      /\$\{CLAUDE_SKILL_DIR\}\/references/,
      `${lang}: subagent に skill 変数を渡さない`,
    );
  }
});

// 表の直後の段落は MARKDOWN.md § Do not が禁じる。集計は表の前に置く。
test("集計行が DR Promotion Candidates 表の前にある", () => {
  for (const [lang, path] of Object.entries(templates)) {
    const doc = readFileSync(path, "utf8");
    const tally = doc.indexOf("keep {N} / downgrade {N} / drop {N}");
    const table = doc.indexOf("| #   | Candidate");
    assert.ok(tally >= 0 && table >= 0, `${lang}: 集計行と表がある`);
    assert.ok(tally < table, `${lang}: 集計が表より前`);
  }
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /(直前に|right before)/, `${lang}: 指示も前に置くと言う`);
  }
});
