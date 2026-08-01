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

// Phase 2 の本文だけを対象にするための抽出。次の "## " 見出しの手前、
// もしくは文書末尾までを Phase 2 の範囲とする。
function extractPhase2(doc) {
  const headingMatch = doc.match(/^## Phase 2:.*$/m);
  if (!headingMatch) return "";
  const start = headingMatch.index;
  const afterHeading = start + headingMatch[0].length;
  const nextHeadingMatch = doc.slice(afterHeading).match(/\n## /);
  const end = nextHeadingMatch ? afterHeading + nextHeadingMatch.index : doc.length;
  return doc.slice(start, end);
}

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

test("各言語の SKILL.md の Phase 2 が、本文の実装方針と plan 下書きを突き合わせる手順を持つ", () => {
  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${path} が存在する`);
    const phase2 = extractPhase2(readFileSync(path, "utf8"));
    if (lang === "ja") {
      assert.match(phase2, /本文.*実装方針/, "ja: 本文の実装方針への言及");
      assert.match(phase2, /plan 下書き/, "ja: plan 下書きへの言及");
      assert.match(phase2, /突き合わせ/, "ja: 突き合わせ手順の言及");
    } else {
      assert.match(
        phase2,
        /implementation (approach|policy)/i,
        "en: implementation policy への言及",
      );
      assert.match(phase2, /plan draft/, "en: plan draft への言及");
      assert.match(phase2, /(compare|match|check)[\s\S]{0,40}against/i, "en: 突き合わせ手順の言及");
    }
  }
});

test("各言語の SKILL.md が、重複した本文側を `## Plan` への参照に置き換えると書く", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const phase2 = extractPhase2(readFileSync(path, "utf8"));
    if (lang === "ja") {
      assert.match(phase2, /重複/, "ja: 重複への言及");
      assert.match(phase2, /## Plan[\s\S]{0,20}参照/, "ja: Plan への参照置き換え");
    } else {
      assert.match(phase2, /duplicat/i, "en: duplicate への言及");
      assert.match(phase2, /## Plan[\s\S]{0,20}reference/i, "en: reference to Plan");
    }
  }
});

test("各言語の SKILL.md が、食い違うときは plan を正として本文を直すと書く", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const phase2 = extractPhase2(readFileSync(path, "utf8"));
    if (lang === "ja") {
      assert.match(phase2, /食い違う/, "ja: 食い違いへの言及");
      assert.match(phase2, /plan を正として/, "ja: plan を正とする方針");
    } else {
      assert.match(phase2, /conflict/i, "en: conflict への言及");
      assert.match(
        phase2,
        /plan[\s\S]{0,20}(is authoritative|as authoritative|as the source of truth)/i,
        "en: plan authoritative への言及",
      );
    }
  }
});

test("plan 下書きが無いときは照合を省く旨が各言語の SKILL.md にある", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const phase2 = extractPhase2(readFileSync(path, "utf8"));
    if (lang === "ja") {
      assert.match(phase2, /plan 下書きが無ければ/, "ja: plan 下書きが無い場合の言及");
      assert.match(phase2, /照合を省く/, "ja: 照合省略の言及");
    } else {
      assert.match(
        phase2,
        /no plan draft|plan draft[\s\S]{0,10}absent|without a plan draft/i,
        "en: no plan draft の言及",
      );
      assert.match(
        phase2,
        /skip[\s\S]{0,20}match|omit[\s\S]{0,20}match/i,
        "en: skip matching の言及",
      );
    }
  }
});
