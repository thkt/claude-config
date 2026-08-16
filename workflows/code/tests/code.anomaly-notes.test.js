import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sites = {
  ja: join(root, ".ja", "workflows", "code.js"),
  en: join(root, "workflows", "code.js"),
};

// Without separating notes from evidence, the agent reads ctx's "check each claim against the
// tool result" as an instruction to enumerate the evidence into one stretch of prose. The PR
// body renders an anomaly with its newlines collapsed onto one line, leaving the reader unable
// to find where the conclusion ends.
test("the no-red notes hold one conclusion sentence and move the grounds to evidence", () => {
  const split = {
    ja: /結論を 1 文で書く/,
    en: /the conclusion in one sentence/,
  };
  const separate = {
    ja: /根拠は notes に混ぜず evidence へ分ける/,
    en: /Keep the supporting facts out of notes and put them in evidence/,
  };
  for (const [name, path] of Object.entries(sites)) {
    const src = readFileSync(path, "utf8");
    assert.match(src, split[name], `${name}: notes holds one conclusion sentence`);
    assert.match(src, separate[name], `${name}: the grounds go to evidence`);
  }
});

// The schema description alone loses to the Red retry's "examine it closely", and the course of
// that examination flows into notes. The division is stated on the prompt side as well.
test("the Red prompt states the division between notes and evidence", () => {
  const split = {
    ja: [
      /結論を notes に 1 文で、根拠を evidence に 1 項目 1 行で書く/,
      /notes に書くのは結論 1 文だけで/,
    ],
    en: [
      /put the conclusion in notes as one sentence and the supporting facts in evidence/,
      /notes carries the conclusion alone, one sentence/,
    ],
  };
  for (const [name, path] of Object.entries(sites)) {
    const src = readFileSync(path, "utf8");
    assert.match(src, split[name][0], `${name}: Red states the division`);
    assert.match(src, split[name][1], `${name}: the Red retry states the division`);
  }
});

test("the no-red anomaly carries evidence into the PR", () => {
  for (const [name, path] of Object.entries(sites)) {
    const src = readFileSync(path, "utf8");
    assert.match(
      src,
      /"red_confirmed", "test_files", "notes", "evidence"/,
      `${name}: required by the schema`,
    );
    assert.match(
      src,
      /evidence: Array\.isArray\(red\.evidence\)/,
      `${name}: the anomaly carries it`,
    );
  }
});
