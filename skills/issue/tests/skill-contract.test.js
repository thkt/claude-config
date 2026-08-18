import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
// Narrows a document to one Phase, so a match cannot land in a neighbouring Phase.
const section = (doc, heading, next) => doc.slice(doc.indexOf(heading), doc.indexOf(next));
const phase2 = (doc) => section(doc, "## Phase 2", "## Phase 3");

const qualifies = {
  ja: join(root, ".ja", "skills", "qualify", "SKILL.md"),
  en: join(root, "skills", "qualify", "SKILL.md"),
};

// qualify's needs-plan tells the reader to transfer a plan with /issue. Without a route taking an
// issue number, that instruction has nothing to run.
test("transferring a Plan into an existing issue exists in both languages and qualify's needs-plan points at it", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    assert.match(
      doc,
      lang === "ja" ? /issue 番号か URL だけを受け取ったとき/ : /only an issue number or URL/,
      `${lang}: a branch taking a bare number is present`,
    );
    assert.match(
      doc,
      /gh issue edit <ref> --body-file/,
      `${lang}: a step writing back into the body is present`,
    );
  }
  for (const [lang, path] of Object.entries(qualifies)) {
    const doc = readFileSync(path, "utf8");
    assert.match(
      doc,
      lang === "ja" ? /`\/issue <番号>`/ : /`\/issue <number>`/,
      `${lang}: needs-plan points at the form passing a number`,
    );
  }
});

test("the feature template carries an optional Accessibility section scoped to UI-touching issues", () => {
  for (const [lang, path] of Object.entries(targets)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /^## Accessibility \((optional|任意)\)/m, `${lang}: the optional section`);
    if (lang === "ja") {
      assert.match(doc, /UI に触れる issue のみ/, "ja: the UI-only condition");
      assert.match(doc, /操作系と満たす基準/, "ja: the intent of input modes plus criteria");
    } else {
      assert.match(doc, /UI-touching issues only/, "en: the UI-only condition");
      assert.match(
        doc,
        /input modes and the criteria/,
        "en: the intent of input modes plus criteria",
      );
    }
  }
});

const matchRefs = {
  ja: join(root, ".ja", "skills", "issue", "references", "duplication-match.md"),
  en: join(root, "skills", "issue", "references", "duplication-match.md"),
};

// Without stating the criteria, even descriptions that can change independently collapse into a
// reference.
test("each language's duplication-match.md defines the match target as a duplication of the same knowledge", () => {
  for (const [lang, path] of Object.entries(matchRefs)) {
    const matchRef = readFileSync(path, "utf8");
    const [target, criterion, independent] =
      lang === "ja"
        ? [/同じ知識が重なる/, /片方を直すともう片方も直る/, /独立に変わりうる/]
        : [
            /carry the same knowledge/i,
            /editing one forces the other to change/i,
            /change independently/i,
          ];
    assert.match(matchRef, target, `${lang}: the target is a duplication of the same knowledge`);
    assert.match(matchRef, criterion, `${lang}: the criteria for the same knowledge`);
    assert.match(matchRef, independent, `${lang}: what changes independently stays in both`);
  }
});

// The table carries the breadth of the target. A missing row narrows the match back to the
// implementation approach alone. Acceptance Criteria overlaps the Plan's Outcome, so dropping the
// exception sentence collapses the human acceptance decision into a reference.
const COUNTERPARTS = {
  ja: [
    ["Approach", "unit の contract"],
    ["Testing Decisions", "T-NNN"],
    ["In scope", "files"],
  ],
  en: [
    ["Approach", "unit contract"],
    ["Testing Decisions", "T-NNN"],
    ["In scope", "files"],
  ],
};

test("each language's duplication-match.md lists the three overlapping pairs and the Acceptance Criteria exception", () => {
  for (const [lang, path] of Object.entries(matchRefs)) {
    const matchRef = readFileSync(path, "utf8");
    for (const [section, counterpart] of COUNTERPARTS[lang]) {
      assert.match(
        matchRef,
        new RegExp(`${section}[^\\n]*${counterpart}`),
        `${lang}: ${section} overlaps ${counterpart}`,
      );
    }
    const [overlap, why] =
      lang === "ja"
        ? [/Acceptance Criteria も Outcome と重なる/, /build に届かないので本文に残す/]
        : [
            /Acceptance Criteria overlaps Outcome/i,
            /drives the human merge call and never reaches build/i,
          ];
    assert.match(matchRef, overlap, `${lang}: Acceptance Criteria overlaps too`);
    assert.match(matchRef, why, `${lang}: the reason it stays in the body regardless`);
  }
});

test("each language's duplication-match.md states the reference runs from the body to the Plan", () => {
  for (const [lang, path] of Object.entries(matchRefs)) {
    const matchRef = readFileSync(path, "utf8");
    if (lang === "ja") {
      assert.match(
        matchRef,
        /参照は本文から `## Plan` へ向ける/,
        "ja: the direction of the reference",
      );
      assert.match(matchRef, /本文の節はそのあとに生まれる/, "ja: why the direction is fixed");
    } else {
      assert.match(
        matchRef,
        /reference runs from the body to `## Plan`/i,
        "en: the direction of the reference",
      );
      assert.match(
        matchRef,
        /sections come into existence after it/i,
        "en: why the direction is fixed",
      );
    }
  }
});

// A step rewriting the body after the match lets the prose it adds skip the match and the
// duplication grows back. Watching only its order against the challenge fold-in would let a change
// appending an item slip through, so the last item itself is pinned as the match.
test("in each language's SKILL.md the match sits as Phase 2's last step", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const refine = phase2(readFileSync(path, "utf8"));
    const [challenge, matching] =
      lang === "ja"
        ? [/challenge の verdict/, /plan 下書きがあれば/]
        : [/challenge verdict/, /When a plan draft exists/];
    const items = [...refine.matchAll(/^\d+\. .*/gm)].map((m) => m[0]);
    assert.ok(items.length >= 2, `${lang}: Phase 2 carries numbered steps`);
    assert.ok(
      items.some((item) => challenge.test(item)),
      `${lang}: the challenge fold-in step is present`,
    );
    assert.match(items.at(-1), matching, `${lang}: the last step is the match`);
  }
});

test("each language's duplication-match.md states the duplicated body side is replaced with a reference to `## Plan`", () => {
  for (const [lang, path] of Object.entries(matchRefs)) {
    const matchRef = readFileSync(path, "utf8");
    if (lang === "ja") {
      assert.match(
        matchRef,
        /## Plan[\s\S]{0,20}参照/,
        "ja: replacement with a reference to the Plan",
      );
      assert.match(
        matchRef,
        /見出しが何をする変更かを述べる 1 行/,
        "ja: the rule of leaving one line per heading",
      );
    } else {
      assert.match(matchRef, /## Plan[\s\S]{0,20}reference/i, "en: reference to Plan");
      assert.match(
        matchRef,
        /one line that states what change/i,
        "en: the rule of leaving one line per heading",
      );
    }
  }
});

test("each language's duplication-match.md states that on a conflict the plan is authoritative and the body is fixed", () => {
  for (const [lang, path] of Object.entries(matchRefs)) {
    const matchRef = readFileSync(path, "utf8");
    if (lang === "ja") {
      assert.match(matchRef, /食い違う/, "ja: the mention of a conflict");
      assert.match(
        matchRef,
        /plan を正として/,
        "ja: the policy of taking the plan as authoritative",
      );
    } else {
      assert.match(matchRef, /conflict/i, "en: the mention of a conflict");
      assert.match(
        matchRef,
        /plan[\s\S]{0,20}(is authoritative|as authoritative|as the source of truth)/i,
        "en: the mention of plan authoritative",
      );
    }
  }
});

test("each language's SKILL.md states the match is skipped when there is no plan draft", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const refine = phase2(readFileSync(path, "utf8"));
    if (lang === "ja") {
      assert.match(refine, /(plan 下書きが)?無ければ/, "ja: the mention of having no plan draft");
      assert.match(refine, /照合を省く/, "ja: the mention of skipping the match");
    } else {
      assert.match(
        refine,
        /no plan draft|plan draft[\s\S]{0,10}absent|without (a plan draft|one)/i,
        "en: the mention of no plan draft",
      );
      assert.match(
        refine,
        /skip[\s\S]{0,20}match|omit[\s\S]{0,20}match/i,
        "en: the mention of skipping the match",
      );
    }
  }
});

// Phase 2 matches against a plan draft and Phase 3 transfers one. With the selection rule stated
// in both places they can pick different drafts, and the issue carries a plan nothing matched.
test("the plan draft is selected in one place", () => {
  for (const lang of ["ja", "en"]) {
    const skill = readFileSync(skills[lang], "utf8");
    const ref = readFileSync(matchRefs[lang], "utf8");
    assert.equal(
      skill.split(".claude/workspace/planning").length - 1,
      0,
      `${lang}: SKILL.md does not restate where the drafts live`,
    );
    assert.equal(
      ref.split(".claude/workspace/planning").length - 1,
      1,
      `${lang}: duplication-match.md names the planning path once`,
    );
    assert.match(
      phase2(skill),
      lang === "ja" ? /どの下書きを選ぶか/ : /which draft to match against/,
      `${lang}: Phase 2 sends the selection to the reference`,
    );
  }
});

test("Phase 1's steps reach the minor-bug branch", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const phase1 = section(doc, "## Phase 1", "###");
    const steps = [...phase1.matchAll(/^\d+\. .*/gm)].map((m) => m[0]);
    assert.ok(steps.length >= 5, `${lang}: Phase 1 carries numbered steps (${steps.length})`);
    assert.ok(
      steps.some((step) => step.includes("/fix")),
      `${lang}: a step offers /fix instead of filing`,
    );
  }
});

// The number route edits an issue somebody else wrote. Running the prose refinement on it rewrites
// their words for a request that only asked to transfer a plan. Each delta sits on the step it
// changes rather than in one list up front, so a step added later carries its own.
test("the number route leaves the existing body's prose alone", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const steps = [...phase2(readFileSync(path, "utf8")).matchAll(/^\d+\. .*/gm)].map((m) => m[0]);
    const [route, skipped, approval] =
      lang === "ja"
        ? [/番号経路/, /行わない/, /承認/]
        : [/number route/i, /does not run/i, /approv/i];
    const marked = steps.filter((step) => route.test(step));
    assert.equal(marked.length, 3, `${lang}: every Phase 2 step carries the number-route delta`);
    assert.ok(
      marked.slice(0, 2).every((step) => skipped.test(step)),
      `${lang}: the refinement and the challenge fold-in are stated as not running`,
    );
    assert.match(marked.at(-1), approval, `${lang}: editing the body waits on approval`);
  }
});

// The number route edits an existing issue, so a single wording announces a filing that is not
// happening.
test("the confirmation names both routes", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /Create this issue\?/, `${lang}: the new-filing wording`);
    assert.match(doc, /Update this issue\?/, `${lang}: the number-route wording`);
  }
});

// A citation naming a heading the same file does not carry sends the reader nowhere.
test("the validator step cites a heading its own language carries", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const cited =
      lang === "ja"
        ? doc.match(/<(.+?)で選んだ骨格ファイル>/)?.[1]
        : doc.match(/<the skeleton chosen in (.+?)>/)?.[1];
    assert.ok(cited, `${lang}: the validator step names where the skeleton came from`);
    assert.match(doc, new RegExp(`^### ${cited}$`, "m"), `${lang}: ### ${cited} exists`);
  }
});

// A build-sized issue needs its plan before the body is written. With the plan arriving later,
// Phase 2's duplication match runs twice: once against a body carrying no Plan, once after the
// transfer.
test("Phase 1 proposes /think before the body is generated", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const phase1 = readFileSync(path, "utf8").split("## Phase 1")[1].split("###")[0];
    const steps = [...phase1.matchAll(/^\d+\. .*/gm)].map((m) => m[0]);
    const think = steps.findIndex((step) => step.includes("/think"));
    const generates = lang === "ja" ? /本文を生成/ : /generate the title and body/;
    const body = steps.findIndex((step) => generates.test(step));
    assert.ok(think >= 0, `${lang}: a step suggests /think`);
    assert.ok(body >= 0, `${lang}: a step generates the body`);
    assert.ok(think < body, `${lang}: /think is proposed first (${think} < ${body})`);
  }
});

// A check with no treatment reads as a step but changes nothing. fix and challenge both state what
// to do when OUTCOME.md is absent and when the work falls outside it.
test("the outcome check states what to do on both branches", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const phase1 = readFileSync(path, "utf8").split("## Phase 1")[1].split("###")[0];
    const step = [...phase1.matchAll(/^\d+\. .*/gm)].map((m) => m[0])[0];
    assert.match(step, /OUTCOME\.md/, `${lang}: the first step reads OUTCOME.md`);
    assert.match(step, /\/outcome/, `${lang}: it says where a missing file comes from`);
    const outside = lang === "ja" ? /外側なら/ : /falls outside/;
    assert.match(step, outside, `${lang}: it states the treatment for work outside the outcome`);
  }
});
