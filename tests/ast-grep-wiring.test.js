// U-005 seam: settings.json grants Bash(ast-grep *) and the two write-capable agents
// (enhancer-code, generator-test) grant Bash(ast-grep:*) in their tools: line. These tests also
// re-check the U-001/U-002 deliverables (TOOLS.md, the use-cli-ast-grep skill) that this unit's
// wiring depends on, so the whole ast-grep introduction is actually reachable end to end.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("settings.json grants ast-grep in the space form every other entry in permissions.allow uses", async () => {
  const settings = JSON.parse(await readFile(join(root, "settings.json"), "utf8"));
  const allow = settings.permissions.allow;

  assert.ok(allow.includes("Bash(ast-grep *)"), "permissions.allow lists Bash(ast-grep *)");

  // The tail of permissions.allow (agent-browser, agy, bfs, cargo, ...) is kept alphabetical.
  // ast-grep sorts between the existing, currently-adjacent agy and bfs entries.
  const spaceForm = /^Bash\(([\w-]+) \*\)$/;
  const names = allow.filter((entry) => spaceForm.test(entry)).map((entry) => entry.match(spaceForm)[1]);
  const i = names.indexOf("ast-grep");
  assert.ok(i > 0, `ast-grep is present among the space-form Bash entries: ${names.join(", ")}`);
  assert.equal(names[i - 1], "agy", "ast-grep sorts right after agy");
  assert.equal(names[i + 1], "bfs", "ast-grep sorts right before bfs");
});

test("enhancer-code and generator-test are the only agent definitions whose tools line grants ast-grep", async () => {
  // Test placement is English-side only (MIRROR.md): the .ja/ mirror never runs its own tests.
  const dir = join(root, "agents");
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => join(e.parentPath ?? e.path, e.name));

  const granters = [];
  for (const file of files) {
    const doc = await readFile(file, "utf8");
    const toolsLine = doc.match(/^tools:.*$/m)?.[0] ?? "";
    if (/Bash\(ast-grep:\*\)/.test(toolsLine)) granters.push(basename(file, ".md"));
  }

  assert.deepEqual(granters.sort(), ["enhancer-code", "generator-test"]);
});

test("rules/development/TOOLS.md carries no paths frontmatter, so it loads in every session", async () => {
  const doc = await readFile(join(root, "rules", "development", "TOOLS.md"), "utf8");
  assert.ok(!/^paths:/m.test(doc), "TOOLS.md declares no paths: key, so nothing gates its load");
});

test("the use-cli-ast-grep skill declares Bash(ast-grep:*) in allowed-tools and sets user-invocable to false", async () => {
  const doc = await readFile(join(root, "skills", "use-cli-ast-grep", "SKILL.md"), "utf8");
  assert.match(doc, /^allowed-tools:.*Bash\(ast-grep:\*\)/m, "allowed-tools grants Bash(ast-grep:*)");
  assert.match(doc, /^user-invocable:\s*false\s*$/m, "user-invocable is false");
});
