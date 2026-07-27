// PR テンプレートの優先順は 2 箇所にある。/pr の SKILL.md と build.js の ship prompt で、
// ship agent は subagent なので SKILL.md を読めず、重複は構造的に消せない。片側だけ変えても
// 実行時には何も落ちないので、この静的照合が同一コミットでの追従を強制する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LANGS = ["ja", "en"];
const at = (lang, ...parts) => join(root, ...(lang === "ja" ? [".ja"] : []), ...parts);

function read(path) {
  assert.ok(existsSync(path), `${path} が存在する`);
  return readFileSync(path, "utf8");
}

// 順序まで見る。集合が一致しても順序が入れ替わると採用されるテンプレートが変わる。
const PRIORITY = [
  ".github/pull_request_template.md",
  "pull_request_template.md",
  "docs/pull_request_template.md",
  "PULL_REQUEST_TEMPLATE/",
];

const positions = (text) => PRIORITY.map((p) => text.indexOf(p));

test("PR テンプレートの優先順が pr SKILL.md と build.js の ship prompt で同順に並ぶ", () => {
  for (const lang of LANGS) {
    for (const [name, path] of [
      ["pr SKILL.md", at(lang, "skills", "pr", "SKILL.md")],
      ["build.js", at(lang, "workflows", "build.js")],
    ]) {
      const found = positions(read(path));
      found.forEach((idx, i) => {
        assert.ok(idx >= 0, `${lang}: ${name} が ${PRIORITY[i]} を書いている`);
      });
      const sorted = [...found].sort((a, b) => a - b);
      assert.deepEqual(found, sorted, `${lang}: ${name} の優先順が定義順どおり`);
    }
  }
});

// 同梱テンプレートの必須節は下流が見出し名で読む。use-workflow-pageshot が How to Test を、
// Related が Closes # で issue 連携を運ぶ。改名すると連携が黙って切れる。
test("同梱テンプレートが下流が依存する必須節を持つ", () => {
  for (const lang of LANGS) {
    const tpl = read(at(lang, "skills", "pr", "templates", "pr.md"));
    for (const heading of ["## How to Test", "## Related", "## Review focus"]) {
      assert.ok(tpl.includes(heading), `${lang}: 骨格に ${heading} がある`);
    }
    assert.ok(tpl.includes("Closes #"), `${lang}: Related が Closes # を運ぶ`);
  }
});

// build.js の ship prompt は同梱テンプレートを path 直書きで指す。path が動くと参照が空を指す。
test("build.js が名指しする同梱 PR テンプレートが実在する", () => {
  const bundled = "skills/pr/templates/pr.md";
  for (const lang of LANGS) {
    assert.ok(
      read(at(lang, "workflows", "build.js")).includes(bundled),
      `${lang}: build.js が ${bundled} を名指しする`,
    );
    assert.ok(
      existsSync(at(lang, "skills", "pr", "templates", "pr.md")),
      `${lang}: 同梱先が実在する`,
    );
  }
});
