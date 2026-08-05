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

const skills = {
  ja: join(root, ".ja", "skills", "issue", "SKILL.md"),
  en: join(root, "skills", "issue", "SKILL.md"),
};
const builds = {
  ja: join(root, ".ja", "workflows", "build.js"),
  en: join(root, "workflows", "build.js"),
};

// Phase 2 の本文だけを対象にするための抽出。skills/qualify/tests/contract.test.js と同じ切り出し方。
function extractPhase2(doc) {
  return doc.slice(doc.indexOf("## Phase 2"), doc.indexOf("## Phase 3"));
}

// 仮マークは issue が本文に書き、build の extract agent が assumptions として集め、ship が
// draft PR の veto 対象として出す。マーカーは build の抽出キーワードなので本文言語を問わず
// 英語で、SKILL.md L20 の「抽出キーワードは英語のまま」に従う。語が揃わないと仮置きが
// 黙って PR から消える。
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

const matchRefs = {
  ja: join(root, ".ja", "skills", "issue", "references", "duplication-match.md"),
  en: join(root, "skills", "issue", "references", "duplication-match.md"),
};

// 判定基準を書かないと、独立に変わりうる記述まで参照に潰れる。
test("各言語の duplication-match.md が、照合対象を同じ知識の重複と定義する", () => {
  for (const [lang, path] of Object.entries(matchRefs)) {
    assert.ok(existsSync(path), `${path} が存在する`);
    const matchRef = readFileSync(path, "utf8");
    const [target, criterion, independent] =
      lang === "ja"
        ? [/同じ知識が重なる/, /片方を直すともう片方も直る/, /独立に変わりうる/]
        : [
            /carry the same knowledge/i,
            /editing one forces the other to change/i,
            /change independently/i,
          ];
    assert.match(matchRef, target, `${lang}: 同じ知識の重複が対象`);
    assert.match(matchRef, criterion, `${lang}: 同じ知識の判定基準`);
    assert.match(matchRef, independent, `${lang}: 独立に変わるものは両方に残す`);
  }
});

// 表が対象の広さを持つ。行が欠けると照合が実装方針だけに戻る。Acceptance Criteria は
// Plan の Outcome と重なるので、例外の一文を落とすと人間の受け入れ判断が参照に潰れる。
const COUNTERPARTS = {
  ja: [
    ["Approach", "unit の contract"],
    ["Testing Decisions", "T-NNN"],
    ["Premises", "前提"],
    ["In scope", "files"],
  ],
  en: [
    ["Approach", "unit contract"],
    ["Testing Decisions", "T-NNN"],
    ["Premises", "Preconditions"],
    ["In scope", "files"],
  ],
};

test("各言語の duplication-match.md が、重なる 4 組と Acceptance Criteria の例外を並べる", () => {
  for (const [lang, path] of Object.entries(matchRefs)) {
    const matchRef = readFileSync(path, "utf8");
    for (const [section, counterpart] of COUNTERPARTS[lang]) {
      assert.match(
        matchRef,
        new RegExp(`${section}[^\\n]*${counterpart}`),
        `${lang}: ${section} は ${counterpart} と重なる`,
      );
    }
    const [overlap, why] =
      lang === "ja"
        ? [/Acceptance Criteria も Outcome と重なる/, /build に届かないので本文に残す/]
        : [
            /Acceptance Criteria overlaps Outcome/i,
            /drives the human merge call and never reaches build/i,
          ];
    assert.match(matchRef, overlap, `${lang}: Acceptance Criteria も重なる`);
    assert.match(matchRef, why, `${lang}: それでも本文に残す理由`);
  }
});

test("各言語の duplication-match.md が、参照を本文から Plan へ向けると書く", () => {
  for (const [lang, path] of Object.entries(matchRefs)) {
    const matchRef = readFileSync(path, "utf8");
    if (lang === "ja") {
      assert.match(matchRef, /参照は本文から `## Plan` へ向ける/, "ja: 参照の向き");
      assert.match(matchRef, /本文の節はそのあとに生まれる/, "ja: 向きが決まる理由");
    } else {
      assert.match(matchRef, /reference runs from the body to `## Plan`/i, "en: 参照の向き");
      assert.match(matchRef, /sections come into existence after it/i, "en: 向きが決まる理由");
    }
  }
});

// 照合より後ろに本文を書き換える手順が来ると、そこで足された散文は照合を通らず重複が生え直す。
// challenge 折り込みとの前後だけを見ると、項目を末尾に足す変更が素通りするので、最後の項目
// そのものを照合だと固定する。
test("各言語の SKILL.md で照合が Phase 2 の最後の手順に置かれる", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const phase2 = extractPhase2(readFileSync(path, "utf8"));
    const [challenge, matching] =
      lang === "ja"
        ? [/challenge の verdict/, /plan 下書きがあれば/]
        : [/challenge verdict/, /When a plan draft exists/];
    const items = [...phase2.matchAll(/^\d+\. .*/gm)].map((m) => m[0]);
    assert.ok(items.length >= 2, `${lang}: Phase 2 が番号付きの手順を持つ`);
    assert.ok(
      items.some((item) => challenge.test(item)),
      `${lang}: challenge 折り込みの手順がある`,
    );
    assert.match(items.at(-1), matching, `${lang}: 最後の手順が照合`);
  }
});

test("各言語の duplication-match.md が、重複した本文側を `## Plan` への参照に置き換えると書く", () => {
  for (const [lang, path] of Object.entries(matchRefs)) {
    const matchRef = readFileSync(path, "utf8");
    if (lang === "ja") {
      assert.match(matchRef, /## Plan[\s\S]{0,20}参照/, "ja: Plan への参照置き換え");
      assert.match(
        matchRef,
        /見出しが何をする変更かを述べる 1 行/,
        "ja: 見出しごとに 1 行残す規定",
      );
    } else {
      assert.match(matchRef, /## Plan[\s\S]{0,20}reference/i, "en: reference to Plan");
      assert.match(matchRef, /one line that states what change/i, "en: 見出しごとに 1 行残す規定");
    }
  }
});

test("各言語の duplication-match.md が、食い違うときは plan を正として本文を直すと書く", () => {
  for (const [lang, path] of Object.entries(matchRefs)) {
    const matchRef = readFileSync(path, "utf8");
    if (lang === "ja") {
      assert.match(matchRef, /食い違う/, "ja: 食い違いへの言及");
      assert.match(matchRef, /plan を正として/, "ja: plan を正とする方針");
    } else {
      assert.match(matchRef, /conflict/i, "en: conflict への言及");
      assert.match(
        matchRef,
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
