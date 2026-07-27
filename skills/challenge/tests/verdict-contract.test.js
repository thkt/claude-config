import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "challenge", "SKILL.md"),
  en: join(root, "skills", "challenge", "SKILL.md"),
};
const agents = {
  ja: join(root, ".ja", "agents", "critics", "critic-design.md"),
  en: join(root, "agents", "critics", "critic-design.md"),
};

// critic-design が返す verdict は agent 定義が決める。challenge が GO / NO-GO を返せと
// 指示すると、agent 定義と Task prompt が競合し、受け取り側は解釈できない値を掴む。
test("challenge が critic-design の verdict をそのまま受ける", () => {
  const table = readFileSync(agents.en, "utf8");
  const verdicts = [...table.matchAll(/^\| (confirmed|weakened|needs_revision) +\|/gm)].map(
    (m) => m[1],
  );
  assert.equal(verdicts.length, 3, `agent の verdict を 3 つ読める (${verdicts.join(", ")})`);

  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${path} が存在する`);
    const doc = readFileSync(path, "utf8");
    for (const verdict of verdicts) {
      assert.match(doc, new RegExp(verdict), `${lang}: ${verdict} の扱いを書いている`);
    }
    assert.doesNotMatch(
      doc,
      /verdict: "GO" \| "NO-GO"/,
      `${lang}: agent に GO / NO-GO を返させていない`,
    );
  }
});

// weaknesses は viewpoint / severity / finding / evidence / probe を持つ項目の配列。
// string[] と書くと、突き合わせで severity を落として重複判定を誤る。
test("weaknesses の形が agent の Output と揃う", () => {
  assert.match(
    readFileSync(agents.en, "utf8"),
    /Each item includes viewpoint, severity, finding, evidence/,
    "agent が weaknesses の中身を列挙する",
  );
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    assert.doesNotMatch(doc, /weaknesses: string\[\]/, `${lang}: string[] と書いていない`);
    assert.match(doc, /severity/, `${lang}: 項目の中身に触れている`);
  }
});

// Phase 2 で走るのは critic-design 2 体だけ。表に載る Pass と手順が起動するものを揃える。
test("Phase 2 の Pass 表が手順と一致する", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const phase2 = doc.slice(doc.indexOf(lang === "ja" ? "## Phase 2" : "## Phase 2"));
    const passes = phase2.match(/^\| critic-design \(/gm) || [];
    assert.equal(passes.length, 2, `${lang}: Pass が critic-design 2 体 (${passes.length})`);
    assert.doesNotMatch(phase2, /^\| advisor /m, `${lang}: 起動しない Pass を表に載せない`);
  }
});
