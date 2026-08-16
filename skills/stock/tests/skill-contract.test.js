import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "stock", "SKILL.md"),
  en: join(root, "skills", "stock", "SKILL.md"),
};

// An agent Reads the paths SKILL.md names. Watching them by filename string would pass when a
// target was renamed and SKILL.md left unfixed, and fail when both were fixed correctly. What is
// worth catching is a missing target, so existence is what gets checked.
const refsIn = (doc) => [...doc.matchAll(/\$\{CLAUDE_SKILL_DIR\}(\/[\w./-]+)/g)].map((m) => m[1]);

test("every in-skill path SKILL.md names exists", () => {
  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${lang}: ${path} exists`);
    const refs = new Set(refsIn(readFileSync(path, "utf8")));
    assert.ok(refs.size > 0, `${lang}: at least one in-skill reference is present`);
    for (const ref of refs) {
      const resolved = join(dirname(path), ref);
      assert.ok(existsSync(resolved), `${lang}: the target of ${ref} exists`);
    }
  }
});

// The steps that call the decision itself, and the format convention for reading its result.
// Dropping either leaves the agent reading SKILL.md unable to tell what to run or how to read it.
// What is watched is the location rather than the filename.
test("SKILL.md references both scripts and references", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const refs = refsIn(readFileSync(path, "utf8"));
    assert.ok(
      refs.some((ref) => ref.startsWith("/scripts/")),
      `${lang}: it references the script to run`,
    );
    assert.ok(
      refs.some((ref) => ref.startsWith("/references/")),
      `${lang}: it references the convention for reading the decision`,
    );
  }
});
