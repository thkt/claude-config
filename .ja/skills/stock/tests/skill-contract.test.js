import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "stock", "SKILL.md"),
  en: join(root, "skills", "stock", "SKILL.md"),
};

// 参照を欠くと、SKILL.md を読む agent は何を実行し、結果をどのフォーマット規約に照らして
// 読めばよいか分からなくなる。記法は SKILLS.md § Reference notation に従う。
test("JA と EN の SKILL.md が references/reference-index-format.md と scripts/check-index.js を参照している", () => {
  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${lang}: ${path} が存在する`);
    const doc = readFileSync(path, "utf8");
    assert.match(
      doc,
      /references\/reference-index-format\.md/,
      `${lang}: references/reference-index-format.md を参照する`,
    );
    assert.match(
      doc,
      /\$\{CLAUDE_SKILL_DIR\}\/scripts\/check-index\.js/,
      `${lang}: \${CLAUDE_SKILL_DIR}/scripts/check-index.js を参照する`,
    );
  }
});
