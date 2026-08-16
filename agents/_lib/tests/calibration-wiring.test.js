import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sides = {
  ja: {
    cal: join(root, ".ja", "agents", "_lib", "calibration-examples.md"),
    rev: join(root, ".ja", "agents", "reviewers"),
  },
  en: {
    cal: join(root, "agents", "_lib", "calibration-examples.md"),
    rev: join(root, "agents", "reviewers"),
  },
};

// Takes the section symbol and the owning reviewer from a heading of the form
// "## CHX (reviewer-resilience)".
const sectionsOf = (calPath) =>
  new Map(
    [...readFileSync(calPath, "utf8").matchAll(/^## ([A-Z0-9]+) \((reviewer-[a-z-]+)\)$/gm)].map(
      (m) => [m[1], m[2]],
    ),
  );

// The section symbol a reviewer definition references. A reviewer with no Calibration section is
// null.
const refsOf = (revDir) => {
  const out = new Map();
  for (const file of readdirSync(revDir).filter((f) => f.endsWith(".md"))) {
    const doc = readFileSync(join(revDir, file), "utf8");
    // The symbol sits on opposite sides: "section SEC" in en and "の SEC セクション" in ja.
    const m =
      doc.match(/calibration-examples\.md[^\n]*?section ([A-Z0-9]+)/) ||
      doc.match(/calibration-examples\.md[^\n]*?の ([A-Z0-9]+) セクション/);
    out.set(file.replace(/\.md$/, ""), m ? m[1] : null);
  }
  return out;
};

// A reviewer whose target disappeared runs silently without calibration. Nothing shows at run
// time, so the two sides are matched here.
test("every section a reviewer references exists", () => {
  for (const [lang, { cal, rev }] of Object.entries(sides)) {
    const sections = sectionsOf(cal);
    for (const [reviewer, ref] of refsOf(rev)) {
      if (ref === null || sections.has(ref)) continue;
      // Absence is allowed only when the reviewer itself defines the uncalibrated behavior.
      const doc = readFileSync(join(rev, `${reviewer}.md`), "utf8");
      assert.match(
        doc,
        /pending_calibration/,
        `${lang}: ${reviewer} references a missing ${ref} and names no fallback`,
      );
    }
  }
});

// A section stays unread when the reviewer side carries no Calibration section. CHX sat in that
// state.
test("every section has a reader", () => {
  for (const [lang, { cal, rev }] of Object.entries(sides)) {
    const used = new Set([...refsOf(rev).values()].filter(Boolean));
    for (const [symbol, owner] of sectionsOf(cal)) {
      assert.ok(used.has(symbol), `${lang}: no reviewer reads ${symbol} (${owner})`);
    }
  }
});

// A heading inside an example that escapes its code fence floats as a top-level heading. The DOC
// section broke this way and the section itself stopped being detectable.
test("every top-level heading is a section heading", () => {
  for (const [lang, { cal }] of Object.entries(sides)) {
    const doc = readFileSync(cal, "utf8").replace(/^```[a-z]*\n.*?^```/gms, "");
    const strays = [...doc.matchAll(/^## (.+)$/gm)]
      .map((m) => m[1])
      .filter((h) => !/^[A-Z0-9]+ \(reviewer-[a-z-]+\)$/.test(h));
    assert.deepEqual(strays, [], `${lang}: something other than a section heading floats`);
  }
});

// Code examples are not translated. Diverging content between ja and en would show different code
// while claiming to give the same calibration.
test("the code examples match between ja and en", () => {
  const blocks = (p) => readFileSync(p, "utf8").match(/^```[a-z]*\n[\s\S]*?^```/gm) || [];
  const ja = blocks(sides.ja.cal);
  const en = blocks(sides.en.cal);
  assert.equal(ja.length, en.length, "the code block counts match");
  ja.forEach((block, i) => assert.equal(block, en[i], `code block ${i + 1} matches`));
});
