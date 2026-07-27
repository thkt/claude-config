import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const targets = {
  ja: join(root, ".ja", "skills", "issue", "templates", "feature.md"),
  en: join(root, "skills", "issue", "templates", "feature.md"),
};

// 仮マークは issue が本文に書き、build の extract agent が assumptions として集め、ship が
// draft PR の veto 対象として出す。マーカーは build の抽出キーワードなので本文言語を問わず
// 英語で、SKILL.md L20 の「抽出キーワードは英語のまま」に従う。語が揃わないと仮置きが
// 黙って PR から消える。
const skills = {
  ja: join(root, ".ja", "skills", "issue", "SKILL.md"),
  en: join(root, "skills", "issue", "SKILL.md"),
};
const builds = {
  ja: join(root, ".ja", "workflows", "build.js"),
  en: join(root, "workflows", "build.js"),
};

test("仮マークが両言語で tentative に揃い、build の extract prompt もそれを名指しする", () => {
  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${path} が存在する`);
    const doc = readFileSync(path, "utf8");
    assert.ok(doc.includes("(tentative:"), `${lang}: SKILL.md が (tentative: を書いている`);
    assert.ok(!doc.includes("(仮:"), `${lang}: SKILL.md に日本語マーカーが残っていない`);
    assert.match(doc, /Premises/, `${lang}: SKILL.md が Premises 節に触れている`);
  }
  for (const [lang, path] of Object.entries(builds)) {
    assert.ok(existsSync(path), `${path} が存在する`);
    const src = readFileSync(path, "utf8");
    assert.ok(
      src.includes("(tentative: ...)"),
      `${lang}: build.js の extract prompt が (tentative: ...) を名指しする`,
    );
    assert.match(src, /Premises/, `${lang}: build.js の extract prompt が Premises 節を名指しする`);
  }
  for (const [lang, path] of Object.entries(targets)) {
    assert.ok(!readFileSync(path, "utf8").includes("(仮:"), `${lang}: テンプレートも tentative`);
  }
});

test("feature テンプレートが UI に触れる issue 限定の任意 Accessibility 節を持つ", () => {
  for (const [lang, path] of Object.entries(targets)) {
    assert.ok(existsSync(path), `${path} が存在する`);
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /^## Accessibility \((optional|任意)\)/m, `${lang}: 任意節`);
    if (lang === "ja") {
      assert.match(doc, /UI に触れる issue のみ/, "ja: UI 限定の条件");
      assert.match(doc, /操作系と満たす基準/, "ja: 操作系 + 基準の意図");
    } else {
      assert.match(doc, /UI-touching issues only/, "en: UI 限定の条件");
      assert.match(doc, /input modes and the criteria/, "en: 操作系 + 基準の意図");
    }
  }
});
