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

// U-006 は check-index.js (U-002〜U-005 で実装済み) を SKILL.md の Phase から呼び出す層。
// references/reference-index-format.md (行フォーマットの正) と scripts/check-index.js (判定本体)
// への参照を欠くと、SKILL.md を読む agent は何を実行し、その結果をどのフォーマット規約に
// 照らして読めばよいか分からなくなる。skills/census/SKILL.md が
// `${CLAUDE_SKILL_DIR}/references/decision-criteria.md` 形式でスクリプト/参照先を指す
// 規約 (SKILLS.md の Reference notation) に倣うことをここで検証する。
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
