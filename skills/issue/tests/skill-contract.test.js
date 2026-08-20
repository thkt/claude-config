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
      lang === "ja" ? /issue 番号または URL だけを受け取った場合/ : /only an issue number or URL/,
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

const reviewRefs = {
  ja: join(root, ".ja", "skills", "issue", "references", "prose-review.md"),
  en: join(root, "skills", "issue", "references", "prose-review.md"),
};

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
        ? [/同じ知識が重なる/, /片方を直すともう片方も直す必要がある/, /独立に変わりうる/]
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
        ? [
            /Acceptance Criteria も Outcome と重なる/,
            /build には渡らず、人間がマージを判断する際に使う/,
          ]
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
      assert.match(
        matchRef,
        /plan を独立したファイルへ書き出した後で、本文の節が作られる/,
        "ja: why the direction is fixed",
      );
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
        /見出しが何を変更するかを述べる 1 行/,
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
      assert.match(refine, /plan 下書きがなければ/, "ja: the mention of having no plan draft");
      assert.match(refine, /この照合は省略する/, "ja: the mention of skipping the match");
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
    assert.match(ref, /scripts\/pick-plan\.py/, `${lang}: the reference calls the one script`);
    assert.match(skill, /scripts\/pick-plan\.py/, `${lang}: the transfer calls the same script`);
    assert.match(
      phase2(skill),
      lang === "ja" ? /照合する下書きの選択/ : /which draft to match against/,
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

// Updating a filed issue touches something somebody else wrote. Running the prose refinement on it rewrites
// their words for a request that only asked to transfer a plan. Each delta sits on the step it
// changes rather than in one list up front, so a step added later carries its own.
test("updating a filed issue leaves the existing body's prose alone", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const steps = [...phase2(readFileSync(path, "utf8")).matchAll(/^\d+\. .*/gm)].map((m) => m[0]);
    const [route, skipped, approval] =
      lang === "ja"
        ? [/既存 issue の更新時/, /行わない/, /承認/]
        : [/updating a filed issue/i, /does not run/i, /approv/i];
    const marked = steps.filter((step) => route.test(step));
    assert.equal(marked.length, 3, `${lang}: every Phase 2 step carries the update-route delta`);
    assert.ok(
      marked.slice(0, 2).every((step) => skipped.test(step)),
      `${lang}: the refinement and the challenge fold-in are stated as not running`,
    );
    assert.match(marked.at(-1), approval, `${lang}: editing the body waits on approval`);
  }
});

// Updating a filed issue is not a filing, so a single wording announces something that is not
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
    const outside = lang === "ja" ? /範囲外の場合/ : /sits outside/;
    assert.match(step, outside, `${lang}: it states the treatment for work outside the outcome`);
  }
});

// Phase 1 tells the writer to settle an open decision before it reaches the body, but the sentence
// sits inside the step that also generates the body, so a guess written mid-draft passes it. The
// body-level check is what catches one afterwards.
test("the prose review settles guesses after the body is drafted", () => {
  for (const [lang, path] of Object.entries(reviewRefs)) {
    const doc = readFileSync(path, "utf8");
    const settle =
      lang === "ja" ? /推測は AskUserQuestion または Read で確認してから/ : /Settle a guess via/;
    assert.match(doc, settle, `${lang}: the structure table checks for a guess left in the body`);
  }
});

// Picking the draft reads a directory and returns file contents, which the skill's own tools
// cannot do: Read errors on a directory and ugrep reports names without order. A script does it,
// so the skill needs permission to run one, and the script has to hand back what it chose.
test("the selection rule stays within the tools the skill is allowed", () => {
  for (const [lang, path] of Object.entries(skills)) {
    assert.match(
      readFileSync(path, "utf8"),
      /^allowed-tools:.*Bash\(\$\{CLAUDE_SKILL_DIR\}\/scripts\/\*\)/m,
      `${lang}: running a bundled script is allowed`,
    );
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const src = readFileSync(join(root, "skills", "issue", "scripts", "pick-plan.py"), "utf8");
  for (const key of ["path", "plan", "backlog", "candidates", "ambiguous"])
    assert.match(src, new RegExp(`"${key}"`), `the script returns ${key}`);
});

// Independence alone sends a set that all waits on one unbuilt thing into separate issues, and
// each of them is unstartable the moment it is filed. The split question carries readiness so the
// person answering sees that before N issues exist.
test("the split question carries whether each criterion can be started", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const ready = lang === "ja" ? /現時点で着手可能か/ : /can be started now/;
    assert.match(doc, ready, `${lang}: the split assessment asks about readiness`);
  }
});

// The floor lives in three places: the validator enforces it, the body names it so the writer
// knows before drafting, and the skill's own template already carries those sections as required.
// Changing one leaves the writer drafting against a floor the validator no longer holds.
test("the floor matches between the validator, the body, and the templates", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const src = readFileSync(
    join(root, "skills", "issue", "scripts", "validate-issue-body.py"),
    "utf8",
  );
  const block = src.match(/^FLOOR = \{([\s\S]*?)^\}/m)?.[1];
  assert.ok(block, "the validator declares a floor");
  const floor = {};
  for (const row of block.matchAll(/"(\w+)":\s*\(([^)]*)\)/g))
    floor[row[1]] = [...row[2].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(Object.keys(floor).length >= 2, `the floor covers the types (${Object.keys(floor)})`);
  // The prose stating the floor sits in the reference both /issue and /slice read, so that is
  // where the name has to appear rather than in either skill body.
  for (const [type, names] of Object.entries(floor)) {
    for (const name of names) {
      for (const lang of Object.keys(skills))
        assert.match(
          readFileSync(
            join(
              root,
              ...(lang === "ja" ? [".ja"] : []),
              "skills",
              "issue",
              "references",
              "template-source.md",
            ),
            "utf8",
          ),
          new RegExp(`\`${name}\``),
          `${lang}: the shared reference names ${name}`,
        );
      const tmpl = readFileSync(join(root, "skills", "issue", "templates", `${type}.md`), "utf8");
      assert.match(tmpl, new RegExp(`^## ${name}$`, "m"), `${type}.md carries ${name} as required`);
    }
  }
});

// An approach nobody attacked reaches the implementer as a requirement. /think is where it gets
// attacked, since its own Phase 2 launches critic-design unconditionally. Routing states what to
// skip rather than what to catch: an extent nobody can call then still reaches the critique.
test("a stated approach routes to /think rather than into the body", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const phase1 = readFileSync(path, "utf8").split("## Phase 1")[1].split("###")[0];
    const step = [...phase1.matchAll(/^\d+\. .*/gm)]
      .map((m) => m[0])
      .find((s) => s.includes("/think"));
    assert.ok(step, `${lang}: a step suggests /think`);
    const [direction, skipOnly] =
      lang === "ja"
        ? [
            /実装方針が明示されている/,
            /変更が 1〜3 ファイルに収まると判断できる修正に限り、提案を省略/,
          ]
        : [
            /names an implementation direction/,
            /Skipping the suggestion is allowed only for a fix/,
          ];
    assert.match(step, direction, `${lang}: a stated direction is a trigger`);
    assert.match(step, skipOnly, `${lang}: the rule states what to skip, not what to catch`);
  }
  for (const lang of ["ja", "en"]) {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const dir = lang === "ja" ? [root, ".ja"] : [root];
    const doc = readFileSync(join(...dir, "skills", "issue", "templates", "feature.md"), "utf8");
    assert.match(doc, /critic-design/, `${lang}: the Approach section names what has to clear it`);
  }
});

// Updating a filed issue validates through the --content-only flag alone. With the flag named in one place
// and implemented in the other, either side can lose it while every other test still passes, and
// the route goes back to writing an unvalidated body.
test("the update route's validation flag exists in both the instruction and the script", () => {
  const script = readFileSync(
    join(root, "skills", "issue", "scripts", "validate-issue-body.py"),
    "utf8",
  );
  assert.match(script, /"--content-only"/, "the validator carries the flag");
  assert.match(script, /^def content_only_report\(/m, "the flag reaches its own branch");
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const step = doc.split(/^## Phase 4/m)[1].split(/^###/m)[0];
    assert.match(
      step,
      /--content-only <body-file>/,
      `${lang}: Phase 4 tells the update route to pass it`,
    );
  }
});

// Confirming first and validating after shows the user one body and files another, because fixing
// placeholder_left or unfilled_section rewrites what they just approved.
test("Phase 4 validates before it asks for confirmation", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const phase4 = readFileSync(path, "utf8")
      .split(/^## Phase 4/m)[1]
      .split(/^###/m)[0];
    const steps = [...phase4.matchAll(/^\d+\. .*/gm)].map((m) => m[0]);
    const validate = steps.findIndex((step) => step.includes("validate-issue-body.py"));
    const confirm = steps.findIndex((step) => /AskUserQuestion/.test(step));
    assert.ok(validate >= 0, `${lang}: a step runs the validator`);
    assert.ok(confirm >= 0, `${lang}: a step asks for confirmation`);
    assert.ok(validate < confirm, `${lang}: validation comes first (${validate} < ${confirm})`);
  }
});
