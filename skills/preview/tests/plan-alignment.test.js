// plan の id 形式 (U-NNN / T-NNN) は 3 箇所が読む。think のテンプレートが産み、build.js が
// 決定論クロスチェックし、preview の Plan 整合性チェックが diff と突き合わせる。think 側で
// 採番形式を変えても preview は実行時に何も落とさず、照合が静かに空振りする。
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

// 骨格が実際に採番する行を見る。`U-NNN` / `T-NNN` の文字列はガイドラインや表にも出るので、
// 文字列の存在だけでは骨格の採番形式が変わっても気づけない。
test("think の骨格が U-NNN / T-NNN 形式で採番する", () => {
  for (const lang of LANGS) {
    const tpl = read(at(lang, "skills", "think", "templates", "plan.md"));
    assert.match(tpl, /^### U-\d{3}/m, `${lang}: unit 見出しが U-NNN 形式`);
    assert.match(tpl, /^- T-\d{3}/m, `${lang}: 受け入れテスト行が T-NNN 形式`);
  }
});

test("plan の id 形式を preview のチェックリストと build.js が同じ語で指す", () => {
  for (const lang of LANGS) {
    const sites = [
      [
        "preview チェックリスト",
        at(lang, "skills", "preview", "references", "review-checklist.md"),
      ],
      ["build.js", at(lang, "workflows", "build.js")],
    ];
    for (const [name, path] of sites) {
      const doc = read(path);
      for (const id of ["U-NNN", "T-NNN"]) {
        assert.ok(doc.includes(id), `${lang}: ${name} が ${id} を書いている`);
      }
    }
  }
});

// preview は plan を issue の `## Plan` 節から取る。節名は issue が移設し build が要求する契約。
test("preview のチェックリストが plan の所在を ## Plan 節として指す", () => {
  for (const lang of LANGS) {
    const doc = read(at(lang, "skills", "preview", "references", "review-checklist.md"));
    assert.ok(doc.includes("## Plan"), `${lang}: チェックリストが ## Plan 節を指す`);
  }
});
