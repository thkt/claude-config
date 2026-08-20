import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// The phrasing that hands an issue to build, in either language. A routing table's destination
// cell carries no prose particles, so the row-start alternative catches it, and anchoring there
// keeps a passing mention such as "the build workflow's Revalidate" out. `/build` is listed
// because naming the slash command hands an issue over as much as writing the words out.
const HANDOFF =
  /build workflow に|build に渡|build に委譲|build へ|to the build workflow|delegate to build|`\/build`|^\|\s*(The )?build workflow/;
// qualify branches on the presence of a Plan section earlier in its verdict table, so by the
// time the build-ready row is reached the Plan section is already established. issue settles the
// plan at Phase 1: a step there suggests /think before the body is written, which its own
// skill-contract test pins, so its routing table states the destination and nothing else.
const EXEMPT = new Set(["qualify", "issue"]);

const skillDocs = () => {
  const docs = [];
  for (const prefix of ["", ".ja"]) {
    const base = join(root, prefix, "skills");
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || EXEMPT.has(entry.name)) continue;
      const path = join(base, entry.name, "SKILL.md");
      if (existsSync(path)) docs.push({ lang: prefix || "en", name: entry.name, path });
    }
  }
  return docs;
};

// build hands an issue with no ## Plan section back as no-plan. When the skill doing the handoff
// does not say so, whoever followed that instruction stops at the Load stage. A missing wording
// drops nothing at runtime, so only a static match catches it.
test("the handoff instruction names the Plan section on the same line", () => {
  const docs = skillDocs();
  assert.ok(docs.length > 0, "the skill SKILL.md files are readable");

  const missing = [];
  for (const { lang, name, path } of docs) {
    for (const [i, line] of readFileSync(path, "utf8").split("\n").entries()) {
      if (!HANDOFF.test(line)) continue;
      if (/Plan|plan/.test(line)) continue;
      missing.push(`${lang}:${name}:${i + 1}: ${line.trim().slice(0, 60)}`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `a handoff instruction does not name the Plan section\n${missing.join("\n")}`,
  );
});

// An exemption rests on the skill settling the plan somewhere else. When that somewhere else is
// deleted, the exemption keeps the skill out of the check above and nothing reports it.
test("every exempt skill still settles the plan elsewhere", () => {
  for (const name of EXEMPT) {
    for (const prefix of ["", ".ja"]) {
      const path = join(root, prefix, "skills", name, "SKILL.md");
      if (!existsSync(path)) continue;
      const doc = readFileSync(path, "utf8");
      assert.match(doc, /## Plan/, `${prefix || "en"}:${name}: it still names the Plan section`);
      assert.match(
        doc,
        /\/think/,
        `${prefix || "en"}:${name}: it still routes a plan-less issue to /think`,
      );
    }
  }
});
