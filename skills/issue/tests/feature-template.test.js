import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
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

// qualify の needs-plan と build の no-plan は「/think で plan を作り /issue で転記」を指す。
// /issue は起票しかできないので、既存 issue モードが無いとその指示は実行できないまま残る。
const qualifies = {
  ja: join(root, ".ja", "skills", "qualify", "SKILL.md"),
  en: join(root, "skills", "qualify", "SKILL.md"),
};

test("既存 issue への Plan 転記が両言語にあり、qualify の needs-plan がそこを指す", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    assert.match(
      doc,
      lang === "ja" ? /issue 番号か URL だけを受け取ったとき/ : /only an issue number or URL/,
      `${lang}: 番号だけを受け取る分岐がある`,
    );
    assert.match(doc, /gh issue edit <ref> --body-file/, `${lang}: 本文へ書き戻す手順がある`);
  }
  for (const [lang, path] of Object.entries(qualifies)) {
    const doc = readFileSync(path, "utf8");
    assert.match(
      doc,
      lang === "ja" ? /`\/issue <番号>`/ : /`\/issue <number>`/,
      `${lang}: needs-plan が番号を渡す形を指す`,
    );
  }
});

// chore と docs は Premises 節を持たない。テンプレートが仮マークに触れないと、SKILL.md が
// この 2 種に割り当てたインライン限定の書き方が生成時に届かない。
const TEMPLATE_TYPES = ["feature", "bug", "chore", "docs"];

test("4 種のテンプレートが仮マークの書式と基準の在り処を持つ", () => {
  for (const lang of ["ja", "en"]) {
    for (const type of TEMPLATE_TYPES) {
      const dir = lang === "ja" ? [root, ".ja"] : [root];
      const doc = readFileSync(join(...dir, "skills", "issue", "templates", `${type}.md`), "utf8");
      assert.match(doc, /\(tentative: <[^>]+>\)/, `${lang}/${type}: 仮マークの書式`);
      assert.match(
        doc,
        lang === "ja" ? /SKILL\.md § 確信度マーキング/ : /SKILL\.md § Confidence marking/,
        `${lang}/${type}: 基準の在り処`,
      );
      if (type === "chore" || type === "docs") {
        assert.match(
          doc,
          lang === "ja" ? /Premises 節を持たないので/ : /no Premises section here/,
          `${lang}/${type}: インライン限定の断り`,
        );
      }
    }
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
