import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const templates = {
  ja: join(root, ".ja", "skills", "think", "templates", "plan.md"),
  en: join(root, "skills", "think", "templates", "plan.md"),
};
const skills = {
  ja: join(root, ".ja", "skills", "think", "SKILL.md"),
  en: join(root, "skills", "think", "SKILL.md"),
};
const preWriteChecks = {
  ja: join(root, ".ja", "skills", "think", "references", "pre-write-check.md"),
  en: join(root, "skills", "think", "references", "pre-write-check.md"),
};

function read(path) {
  assert.ok(existsSync(path), `${path} exists`);
  return readFileSync(path, "utf8");
}

// Several checks start from build.js rather than from the skeleton, so a rename on build's side is
// caught instead of being copied into the expectation.
const buildJs = () => read(join(root, "workflows", "build.js"));
const steps = (doc) => doc.split("\n").filter((line) => /^\d+\. /.test(line));
const phase = (doc, n) => doc.slice(doc.indexOf(`## Phase ${n}`), doc.indexOf(`## Phase ${n + 1}`));

test("the plan template defines the skeleton (id notation, implementation order, the preconditions subsection, one-line statement tests, test_command, Backlog candidates) and the line-count rule", () => {
  for (const [lang, path] of Object.entries(templates)) {
    const doc = read(path);
    assert.match(doc, /### U-/, `${lang}: the ### U- notation`);
    assert.match(doc, /T-NNN/, `${lang}: the T-NNN notation`);
    if (lang === "ja") {
      assert.match(doc, /^### 前提/m, "ja: the preconditions subsection");
      assert.match(doc, /unit は実装順に並べる/, "ja: the order is the implementation order");
      assert.match(doc, /条件と期待結果を 1 行で言い切る/, "ja: a test is a one-line statement");
      assert.match(doc, /上限は骨格に示した行数/, "ja: the line-count rule");
      assert.match(doc, /分割.{0,40}で解消/, "ja: an overflow is resolved by splitting");
    } else {
      assert.match(doc, /^### Preconditions/m, "en: the Preconditions subsection");
      assert.match(
        doc,
        /List units in implementation order/,
        "en: the order is the implementation order",
      );
      assert.match(doc, /condition \+ expected result/, "en: a test is a one-line statement");
      assert.match(doc, /cap is the line count shown in the skeleton/, "en: the line-count rule");
      assert.match(doc, /splitting/i, "en: an overflow is resolved by splitting");
    }
    assert.ok(!/given/i.test(doc), `${lang}: no given/when/then long form remains`);
    assert.ok(!doc.includes("depends_on"), `${lang}: no depends_on remains`);
    assert.match(doc, /test_command/, `${lang}: where test_command goes`);
    assert.match(doc, /^## Backlog candidates/m, `${lang}: ## Backlog candidates`);
    if (lang === "ja") {
      assert.match(doc, /引用 1 行 \+ やりたいこと 1 行/, "ja: the contract line format");
    } else {
      assert.match(doc, /one citation line \+ one intent line/i, "en: the contract line format");
    }
    assert.match(doc, /EXTRACT_SCHEMA/, `${lang}: it states build.js owns the schema`);
    assert.match(
      doc,
      /クロスチェック|cross-check/,
      `${lang}: the mention of the deterministic cross-check`,
    );
    assert.ok(!doc.includes("build-plan:v1"), `${lang}: no build-plan:v1 remnant`);
    assert.ok(!doc.includes("<details>"), `${lang}: no <details> remnant`);
    assert.ok(!doc.includes("```json"), `${lang}: no json fence is specified`);
  }
});

test("the template's root_cause heading word matches the field name build.js checks", () => {
  // This starts from the key validate() actually reads on a Bug plan. Matching against the
  // schema's description would lose the field on an English rewording alone and break this seam
  // test for a reason unrelated to the token drift it is meant to catch.
  const fieldMatch = buildJs().match(/isBug\s*&&\s*!String\(plan\.(\w+)\s*\|\|/);
  assert.ok(
    fieldMatch,
    "the name of the Bug-only required field is readable from build.js's validate",
  );
  const fieldName = fieldMatch[1];
  const headingToken = new RegExp(`^${fieldName}:`, "m");
  for (const [lang, path] of Object.entries(templates)) {
    const doc = read(path);
    assert.match(
      doc,
      headingToken,
      `${lang}: the root_cause heading word ${fieldName} matches the field name build.js checks`,
    );
  }
});

test("think SKILL.md's contract authoring rule enforces selection through the citation ladder", () => {
  const ja = read(skills.ja);
  assert.match(ja, /生成でなく選択/, "ja: the selection-over-generation principle");
  assert.match(ja, /コード片を新造/, "ja: the ban on inventing a code fragment");
  assert.match(ja, /docs\/wiki/, "ja: citing the wiki");
  assert.match(ja, /公式 docs/, "ja: citing the official docs");
  assert.match(ja, /SOURCING/, "ja: the reference to SOURCING.md's discipline");

  const en = read(skills.en);
  assert.match(en, /Select, do not generate/, "en: selection over generation");
  assert.match(en, /invent new code fragments/i, "en: no invented code fragments");
  assert.match(en, /docs\/wiki/, "en: citing the wiki");
  assert.match(en, /official docs/i, "en: citing the official docs");
  assert.match(en, /SOURCING/, "en: the reference to SOURCING.md's discipline");
});

test("each language's template instructs that a reference module's files carry paths only", () => {
  // build's Revalidate checks each element of files for existence as a path exactly as written
  // (refModuleEntries in workflows/build.js). Mixing in a description of its role stops the run at
  // plan-drift.
  for (const [lang, path] of Object.entries(templates)) {
    const line = read(path)
      .split("\n")
      .find((l) => l.startsWith("- files:") && l.includes("list.tsx"));
    assert.ok(line, `${lang}: the reference module files row is present`);
    assert.match(line, /パスのみ|path only/, `${lang}: the files row instructs paths only`);
  }
});

test("each language's template presents reference_module in the kind-plus-reason form", () => {
  for (const [lang, path] of Object.entries(templates)) {
    const doc = read(path);
    assert.match(
      doc,
      /reference_module: \{kind/,
      `${lang}: the reference_module row starts with kind`,
    );
    assert.match(
      doc,
      /module\/no-module\/new-shape/,
      `${lang}: the kind enum matches build.js's (module/no-module/new-shape)`,
    );
  }
});

// A field the skeleton dropped shows only once a plan written to it stops at Load as
// invalid-plan. Copying the field name from the skeleton side would leave this match unable to
// follow when validate changes what it demands, so it starts from build.js's validate.
test("the field build.js requires when kind is module exists in the skeleton's reference module subsection", () => {
  const fieldMatch = buildJs().match(
    /refModule\.kind === "module"[\s\S]{0,200}?String\(refModule\.(\w+)\s*\|\|/,
  );
  assert.ok(
    fieldMatch,
    "the name of the kind-module-only required field is readable from build.js's validate",
  );
  const fieldName = fieldMatch[1];
  const headings = { ja: "### 参照モジュール", en: "### Reference module" };
  for (const [lang, path] of Object.entries(templates)) {
    const doc = read(path);
    const heading = headings[lang];
    const start = doc.indexOf(heading);
    assert.ok(start !== -1, `${lang}: the ${heading} heading exists`);
    const rest = doc.slice(start + heading.length);
    const nextHeading = rest.search(/^#{2,3}[ \t]/m);
    assert.notStrictEqual(
      nextHeading,
      -1,
      `${lang}: another heading follows the reference module heading`,
    );
    assert.match(
      rest.slice(0, nextHeading),
      new RegExp(`^- ${fieldName}:`, "m"),
      `${lang}: the reference module subsection carries a ${fieldName} row`,
    );
  }
});

// think names a wiki page as a citation source but had no way to find one; the pages the plan
// should cite are the ones bearing on the files its units touch, which only the finder resolves.
// A grant that misses the path leaves the call refused and the citation silently unsourced.
test("think finds the wiki rules through scribe's finder and is granted that path", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = read(path);
    assert.match(
      doc,
      /\$\{CLAUDE_SKILL_DIR\}\/\.\.\/scribe\/scripts\/find_wiki_rule\.py/,
      `${lang}: Phase 3 runs the finder`,
    );
    const grant = doc.match(/^allowed-tools:.*$/m)?.[0] ?? "";
    assert.match(
      grant,
      /Bash\(\$\{CLAUDE_SKILL_DIR\}\/\.\.\/scribe\/scripts\/\*\)/,
      `${lang}: allowed-tools grants running it`,
    );
  }
  assert.ok(
    existsSync(join(root, "skills", "scribe", "scripts", "find_wiki_rule.py")),
    "the finder exists under scribe",
  );
});

// A wiki page has no public symbol, so the Preconditions anchor rule cannot take it. Without the
// path-only form stated, a cited page has nowhere to land and drops out of the plan.
test("a cited wiki page lands in preconditions as a path-only line", () => {
  const WIKI_CITATION = {
    ja: [/定型手順の行を逐語/, /path 単独の行/],
    en: [/定型手順 line verbatim/, /path-only line/],
  };
  for (const [lang, path] of Object.entries(skills)) {
    const doc = read(path);
    for (const re of WIKI_CITATION[lang]) {
      assert.match(doc, re, `${lang}: the wiki citation form is stated`);
    }
  }
});

// The only cross-unit slot the skeleton had was the reference module's conventions row, and that
// subsection disappears whenever kind is not module. A rule like the mirror one bears on every
// unit regardless, so without an unconditional slot it gets pushed into an arbitrary contract.
test("the skeleton carries an unconditional place for a rule bearing across units", () => {
  for (const [lang, path] of Object.entries(templates)) {
    const doc = read(path);
    const heading = lang === "ja" ? "### 決まりごと" : "### Rules";
    assert.match(doc, new RegExp(`^${heading}$`, "m"), `${lang}: the cross-unit rules subsection`);
    const start = doc.indexOf(heading);
    const refModule = doc.indexOf(lang === "ja" ? "### 参照モジュール" : "### Reference module");
    assert.ok(start > refModule, `${lang}: it sits after the reference module subsection`);
    // The reference module subsection is dropped on a non-module kind; this one must not be.
    const body = doc.slice(start, doc.indexOf("### ", start + 3));
    assert.doesNotMatch(body, /kind/, `${lang}: its presence does not depend on kind`);
  }
});

// Reading the rules after the units are cut means cutting them again when a rule lands.
// build branches from a named base and passes --base, overriding the branch the run is on. What
// the arg means belongs to build, and think restating it reads as a field to fill in.
test("base stays build's arg, documented there and absent from think", () => {
  const build = buildJs();
  assert.match(
    build,
    /base \(optional\)[\s\S]{0,200}epic-branch aggregation flow/,
    "build's own arg description says when a base is passed",
  );
  assert.match(
    build,
    /always branch off \$\{baseBranch\} again/,
    "a named base overrides the branch the run is on",
  );
  assert.match(
    build,
    /If already on a non-default branch, keep the current branch/,
    "an empty base keeps the current branch",
  );
  for (const [lang, path] of Object.entries(skills)) {
    const doc = read(path);
    assert.ok(
      !doc.split("\n").some((line) => line.startsWith("| base")),
      `${lang}: think's output table carries no base row`,
    );
    assert.ok(!doc.includes("### base"), `${lang}: think carries no base section`);
  }
});

// Which module to replicate is settled while searching. Leaving that call in the subsection puts
// a Phase 2 decision below Phase 3, where a reader reaches it after the search is over.
test("the reference_module search settles its own outcome in Phase 2", () => {
  const settled = {
    ja: [/もっとも近い 1 つを選び/, /一致が無ければ新規である理由/],
    en: [/Pick the closest one/, /when none matches, note why this shape is new/],
  };
  for (const [lang, path] of Object.entries(skills)) {
    const doc = read(path);
    const phase2 = phase(doc, 2);
    for (const re of settled[lang]) {
      assert.match(phase2, re, `${lang}: Phase 2 settles ${re}`);
    }
    const section = doc.slice(doc.indexOf("### reference_module"));
    assert.doesNotMatch(
      section.split("\n### ")[0],
      lang === "ja" ? /候補が複数なら/ : /When several candidates match/,
      `${lang}: the subsection no longer repeats the picking rule`,
    );
  }
});

// Each of the four states how one plan field is written, so the step settling that field is
// where it has to be cited. A subsection no step reaches is read after the steps are done.
test("every subsection stating how a field is written is cited from a step", () => {
  const cited = {
    ja: ["§ reference_module", "§ test_command", "§ contract", "§ preconditions"],
    en: ["§ reference_module", "§ test_command", "§ contract", "§ preconditions"],
  };
  // The four headings carry the field name as build's schema spells it, in both trees.
  const headings = [
    "### reference_module",
    "### test_command",
    "### contract",
    "### preconditions",
  ];
  for (const [lang, path] of Object.entries(skills)) {
    const doc = read(path);
    for (const [i, marker] of cited[lang].entries()) {
      assert.ok(
        steps(doc).some((line) => line.includes(marker)),
        `${lang}: a step cites ${marker}`,
      );
      assert.ok(doc.includes(headings[i]), `${lang}: ${headings[i]} exists`);
    }
    // The numbering rules left the body for a file, so the step is the only route to them.
    assert.match(
      doc,
      /\$\{CLAUDE_SKILL_DIR\}\/references\/id-numbering\.md/,
      `${lang}: a step routes to the numbering reference`,
    );
    assert.ok(
      existsSync(
        join(root, ...(lang === "ja" ? [".ja"] : []), "skills/think/references/id-numbering.md"),
      ),
      `${lang}: the numbering reference is where the path points`,
    );
  }
});

// The steps run in order, so a field written after the step that consumes it is written too late.
test("the steps settle each plan field before the step that writes the plan out", () => {
  const settles = {
    ja: [/reference_module を記録/, /test_command を決める/, /contract を書く/, /前提を書く/],
    en: [/Record reference_module/, /Settle test_command/, /write its contract/, /preconditions/i],
  };
  for (const [lang, path] of Object.entries(skills)) {
    const list = steps(read(path));
    const writeAt = list.findIndex((line) => line.includes(".claude/workspace/planning/"));
    assert.ok(writeAt >= 0, `${lang}: a step writes the plan out`);
    for (const re of settles[lang]) {
      const at = list.findIndex((line) => re.test(line));
      assert.ok(at >= 0, `${lang}: a step settles ${re}`);
      assert.ok(at < writeAt, `${lang}: ${re} is settled before the write`);
    }
  }
});

// A field in the skeleton that no stage reads costs the writer a line and the reader a question.
// build's EXTRACT_SCHEMA is the only list of what gets consumed. Scoped to the `key:` lines, which
// is where decisions and base drifted; the subsection headings map to keys under other spellings.
test("every `key:` line the skeleton names is one build's schema carries", () => {
  const build = buildJs();
  const required = /^\s*\["outcome",(.*?)\],$/m.exec(build);
  assert.ok(required, "the required list is readable from build.js");
  const consumed = new Set(
    [...`["outcome",${required[1]}]`.matchAll(/"([\w_]+)"/g)].map((m) => m[1]),
  );
  // Read from build.js's own branch on it, so a rename there is caught rather than hard-coded.
  for (const optional of ["root_cause", "reference_module"]) {
    assert.match(build, new RegExp(`plan\\.${optional}\\b`), `build.js reads ${optional}`);
    consumed.add(optional);
  }
  for (const [lang, path] of Object.entries(templates)) {
    const skeleton = /^```markdown\n([\s\S]*?)^```$/m.exec(read(path));
    assert.ok(skeleton, `${lang}: the skeleton fence is readable`);
    // Outcome is written with a capital in the skeleton and lowercase in the schema.
    const fields = [...skeleton[1].matchAll(/^([A-Za-z_]+):/gm)].map((m) => m[1].toLowerCase());
    assert.ok(fields.length >= 3, `${lang}: the skeleton names its top-level fields`);
    for (const field of fields) {
      assert.ok(consumed.has(field), `${lang}: build consumes the skeleton's ${field}`);
    }
  }
});

// The seam unit rests on the wiring gap an incident showed (build.js's validate comment), not on
// think telling every unit to stub its neighbours, which would put the skill ahead of
// TESTING.md's Test double preference.
test("the seam step states the wiring gap and imposes no stubbing default", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = read(path);
    const step = steps(doc).find((line) => line.includes("seam: true"));
    assert.ok(step, `${lang}: a step places the seam unit`);
    assert.match(
      step,
      lang === "ja" ? /配線/ : /wiring/,
      `${lang}: the step names the gap the seam unit covers`,
    );
    assert.doesNotMatch(
      step,
      lang === "ja" ? /各 unit のテストは自分の境界を/ : /Each unit's tests stub/,
      `${lang}: the step states no repo-wide stubbing default`,
    );
  }
});

// Drop the line routing to the reference and its table stays on disk with nothing sending a
// reader to it.
test("Phase 2 routes the research report's parts to the intake reference", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = read(path);
    const phase2 = phase(doc, 2);
    assert.match(
      phase2,
      /\$\{CLAUDE_SKILL_DIR\}\/references\/research-report-intake\.md/,
      `${lang}: Phase 2 names the intake reference`,
    );
    const reference = join(
      root,
      ...(lang === "ja" ? [".ja"] : []),
      "skills",
      "think",
      "references",
      "research-report-intake.md",
    );
    assert.ok(existsSync(reference), `${lang}: the reference is where the path points`);
  }
});

// A rule shaping T-NNN that sits below the write step is applied to a file already on disk.
test("every rule shaping what gets written comes before the step that writes it", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = read(path);
    const phase3 = doc.slice(doc.indexOf("## Phase 3"), doc.indexOf("### test_command"));
    const list = steps(phase3);
    assert.ok(list.length >= 8, `${lang}: Phase 3 carries its numbered steps`);
    const writeAt = list.findIndex((line) => line.includes(".claude/workspace/planning/"));
    assert.ok(writeAt >= 0, `${lang}: a step writes the plan out`);
    for (const [i, step] of list.entries()) {
      if (i === writeAt || !step.includes("T-NNN")) continue;
      assert.ok(i < writeAt, `${lang}: step ${i + 1} shapes T-NNN, so it precedes the write`);
    }
  }
});

test("think reads the wiki rules before the approaches are generated", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = read(path);
    const phase2 = phase(doc, 2);
    assert.match(phase2, /find_wiki_rule\.py/, `${lang}: Phase 2 runs the finder`);
    const phase3 = doc.slice(doc.indexOf("## Phase 3"));
    assert.match(
      phase3,
      /find_wiki_rule\.py/,
      `${lang}: Phase 3 runs it again on the settled files`,
    );
  }
});

// "Read them" leaves no trace of a page that was read and judged irrelevant, so the next reader
// cannot tell it from one that was never found.
test("every matched page is either cited or written off with a reason", () => {
  const DISPOSITION = { ja: /当たらない理由/, en: /written off in the prose with the reason/ };
  for (const [lang, path] of Object.entries(skills)) {
    assert.match(read(path), DISPOSITION[lang], `${lang}: the disposition of a matched page`);
  }
});

test("each language's template carries a root_cause row for a Bug task", () => {
  for (const [lang, path] of Object.entries(templates)) {
    const doc = read(path);
    assert.match(
      doc,
      /^Outcome:.*\n^root_cause:/m,
      `${lang}: root_cause sits immediately after Outcome`,
    );
    assert.match(doc, /Bug/, `${lang}: root_cause is described as Bug-task only`);
  }
});

test("think SKILL.md's precondition rule and pre-writeout verification carry the stable anchor and the existence check", () => {
  const ja = read(skills.ja);
  assert.match(ja, /既存.{0,10}依存先のみ/, "ja: existing dependencies only");
  assert.match(
    ja,
    /新しく作るファイル.{0,20}載せない/,
    "ja: a file the unit newly creates is not listed",
  );
  assert.match(ja, /stable anchor/, "ja: stable anchor");
  assert.match(ja, /公開シンボル/, "ja: an exported symbol name");
  assert.match(
    ja,
    /安定.{0,10}シンボルが無ければ.{0,10}path のみ/,
    "ja: with no stable symbol, the path alone",
  );
  const jaCheck = read(preWriteChecks.ja);
  assert.match(jaCheck, /test -f/, "ja: the test -f existence check");
  assert.match(jaCheck, /ugrep -F/, "ja: the ugrep -F existence check");
  assert.match(ja, /pre-write-check\.md/, "ja: Phase 3 reads the pre-writeout verification");

  const en = read(skills.en);
  assert.match(en, /existing dependenc/i, "en: existing dependencies only");
  assert.match(en, /newly created/i, "en: a newly created file is not listed");
  assert.match(en, /stable anchor/i, "en: stable anchor");
  assert.match(en, /exported/i, "en: an exported symbol name");
  assert.match(en, /path only/i, "en: the path-only fallback");
  const enCheck = read(preWriteChecks.en);
  assert.match(enCheck, /test -f/, "en: the test -f existence check");
  assert.match(enCheck, /ugrep -F/, "en: the ugrep -F existence check");
  assert.match(en, /pre-write-check\.md/, "en: Phase 3 reads the pre-writeout verification");
});

test("each language's SKILL.md carries the rule of asking for the cause and its grounds on a Bug task", () => {
  const ja = read(skills.ja);
  assert.match(ja, /Bug/, "ja: the mention of a Bug task");
  assert.match(ja, /Bug[\s\S]{0,150}原因/, "ja: it asks for the cause in the Bug context");
  assert.match(
    ja,
    /原因[\s\S]{0,60}根拠|根拠[\s\S]{0,60}原因/,
    "ja: the cause and its grounds are asked for together",
  );

  const en = read(skills.en);
  assert.match(en, /Bug/, "en: Bug task mention");
  assert.match(en, /Bug[\s\S]{0,150}(root cause|cause)/i, "en: asks the cause in Bug context");
  assert.match(
    en,
    /(root cause|cause)[\s\S]{0,80}(evidence|basis|grounds)|(evidence|basis|grounds)[\s\S]{0,80}(root cause|cause)/i,
    "en: cause and evidence asked together",
  );
});

test("each language's SKILL.md carries a branch sending a Bug with an unsettled cause to research", () => {
  const ja = read(skills.ja);
  assert.match(ja, /原因.{0,20}(未確定|不明)/, "ja: the condition for an unsettled cause");
  assert.match(
    ja,
    /(未確定|不明)[\s\S]{0,150}\/research|\/research[\s\S]{0,150}(未確定|不明)/,
    "ja: the branch sending an unsettled cause to /research",
  );

  const en = read(skills.en);
  assert.match(
    en,
    /cause[\s\S]{0,20}(undetermined|unclear|unknown)/i,
    "en: undetermined-cause condition",
  );
  assert.match(
    en,
    /(undetermined|unclear|unknown)[\s\S]{0,150}\/research|\/research[\s\S]{0,150}(undetermined|unclear|unknown)/i,
    "en: routes undetermined-cause Bug to /research",
  );
});

test("each language's SKILL.md puts the reference_module search before the design is approved", () => {
  const ja = read(skills.ja);
  const jaPhase2Start = ja.indexOf("## Phase 2");
  const jaCriticLaunch = ja.indexOf("`critic-design` を起動する");
  assert.ok(
    jaPhase2Start !== -1 && jaCriticLaunch !== -1,
    "ja: both Phase 2 and the critic-design launch line exist",
  );
  const jaRefSearch = ja.indexOf("reference_module", jaPhase2Start);
  assert.ok(
    jaRefSearch !== -1 && jaRefSearch < jaCriticLaunch,
    "ja: the reference_module search is written before the critic-design launch",
  );

  const en = read(skills.en);
  const enPhase2Start = en.indexOf("## Phase 2");
  const enCriticLaunch = en.indexOf("Launch `critic-design`");
  assert.ok(
    enPhase2Start !== -1 && enCriticLaunch !== -1,
    "en: Phase 2 and critic-design launch line exist",
  );
  const enRefSearch = en.indexOf("reference_module", enPhase2Start);
  assert.ok(
    enRefSearch !== -1 && enRefSearch < enCriticLaunch,
    "en: reference_module search precedes critic-design launch",
  );
});

test("each language's SKILL.md carries the rule of recording the search result as a kind plus a reason", () => {
  const ja = read(skills.ja);
  assert.match(ja, /kind/, "ja: recording through kind");
  assert.match(
    ja,
    /module\/no-module\/new-shape/,
    "ja: the kind enum is module/no-module/new-shape",
  );
  assert.match(
    ja,
    /kind[\s\S]{0,80}理由|理由[\s\S]{0,80}kind/,
    "ja: the kind and the reason are recorded together",
  );

  const en = read(skills.en);
  assert.match(en, /kind/, "en: recorded by kind");
  assert.match(
    en,
    /module\/no-module\/new-shape/,
    "en: kind enum matches module/no-module/new-shape",
  );
  assert.match(
    en,
    /kind[\s\S]{0,80}reason|reason[\s\S]{0,80}kind/i,
    "en: kind and reason recorded together",
  );
});

test("each language's template carries the manual verification heading immediately before Backlog candidates", () => {
  for (const [lang, path] of Object.entries(templates)) {
    const doc = read(path);
    const headingToken = lang === "ja" ? "### 実機確認" : "### Manual verification";
    const headingMatch = doc.match(new RegExp(`^${headingToken}.*$`, "m"));
    assert.ok(headingMatch, `${lang}: the ${headingToken} heading exists`);
    const afterHeading = doc.slice(headingMatch.index + headingMatch[0].length);
    const nextHeadingMatch = afterHeading.match(/^#{2,3}[ \t].*$/m);
    assert.ok(nextHeadingMatch, `${lang}: another heading follows the manual verification heading`);
    assert.strictEqual(
      nextHeadingMatch[0].trim(),
      "## Backlog candidates",
      `${lang}: the heading right after manual verification is Backlog candidates`,
    );
  }
});

test("the guidelines state that an acceptance test bullet carries T-NNN alone and never mixes with a manual verification bullet", () => {
  const ja = read(templates.ja);
  assert.match(
    ja,
    /T-NNN[\s\S]{0,150}実機確認[\s\S]{0,60}混ざら|実機確認[\s\S]{0,150}T-NNN[\s\S]{0,60}混ざら/,
    "ja: the guideline that an acceptance test bullet carries T-NNN alone and never mixes with a manual verification bullet",
  );

  const en = read(templates.en);
  assert.match(
    en,
    /T-NNN[\s\S]{0,150}Manual verification[\s\S]{0,60}mix|Manual verification[\s\S]{0,150}T-NNN[\s\S]{0,60}mix/i,
    "en: guideline stating acceptance-test bullets are T-NNN only, not mixed with manual-verification bullets",
  );
});

test("each language's SKILL.md carries the rule of delegating a criterion test_command cannot run to manual verification", () => {
  const ja = read(skills.ja);
  const jaPhase3 = ja.slice(ja.indexOf("## Phase 3"), ja.indexOf("## 出力"));
  assert.match(
    jaPhase3,
    /test_command[\s\S]{0,120}実行できない[\s\S]{0,150}実機確認|実機確認[\s\S]{0,150}test_command[\s\S]{0,120}実行できない/,
    "ja: the rule delegating a criterion test_command cannot run to manual verification",
  );
  assert.match(
    jaPhase3,
    /実機確認[\s\S]{0,40}(委譲|送る)/,
    "ja: it names manual verification as where it is delegated",
  );
  assert.match(
    read(preWriteChecks.ja),
    /実機確認/,
    "ja: the pre-writeout verification carries an item for manual verification",
  );

  const en = read(skills.en);
  const enPhase3 = en.slice(en.indexOf("## Phase 3"), en.indexOf("## Output"));
  assert.match(
    enPhase3,
    /test_command[\s\S]{0,120}cannot[\s\S]{0,150}[Mm]anual verification|[Mm]anual verification[\s\S]{0,150}test_command[\s\S]{0,120}cannot/,
    "en: routes criteria test_command cannot execute to Manual verification",
  );
  assert.match(
    enPhase3,
    /[Mm]anual verification[\s\S]{0,40}(delegat|route|send)/i,
    "en: delegation destination named",
  );
  assert.match(
    read(preWriteChecks.en),
    /[Mm]anual verification/i,
    "en: pre-writeout verification covers manual verification routing",
  );
});

test("each language's SKILL.md carries the rule of enumerating the fields in T-NNN for a field-rendering unit", () => {
  const ja = read(skills.ja);
  const jaPhase3 = ja.slice(ja.indexOf("## Phase 3"), ja.indexOf("## 出力"));
  assert.match(
    jaPhase3,
    /ドメイン.{0,10}フィールド[\s\S]{0,20}描画/,
    "ja: the mention of a unit rendering domain fields",
  );
  assert.match(
    jaPhase3,
    /(表示フィールド|描画)[\s\S]{0,80}T-NNN|T-NNN[\s\S]{0,80}(表示フィールド|描画)/,
    "ja: the rule of enumerating the displayed fields in T-NNN",
  );

  const en = read(skills.en);
  const enPhase3 = en.slice(en.indexOf("## Phase 3"), en.indexOf("## Output"));
  assert.match(
    enPhase3,
    /domain field[\s\S]{0,20}render|render[\s\S]{0,20}domain field/i,
    "en: mention of a unit rendering domain fields",
  );
  assert.match(
    enPhase3,
    /(displayed field|rendered field)[\s\S]{0,80}T-NNN|T-NNN[\s\S]{0,80}(displayed field|rendered field)/i,
    "en: rule enumerating displayed fields as T-NNN",
  );
});

test("the template's manual verification heading matches build.js's extraction regex", () => {
  // This runs the very regex build.js uses at run time rather than reconstructing one.
  // Reproducing the tokens by hand would miss a run-time difference (\b's non-ASCII behavior, for
  // one), so this seam test turns the production regex literal into a RegExp as it stands and
  // applies it to the template.
  const regexLineMatch = buildJs().match(/manualHeading\s*=\s*body\.match\((\/.+\/m)\)/);
  assert.ok(
    regexLineMatch,
    "the manual verification heading extraction regex line is readable from build.js",
  );
  const literal = regexLineMatch[1];
  const lastSlash = literal.lastIndexOf("/");
  const extractionRegex = new RegExp(literal.slice(1, lastSlash), literal.slice(lastSlash + 1));

  assert.match(
    read(templates.ja),
    extractionRegex,
    "ja: the template heading matches build.js's extraction regex as a run-time object",
  );
  assert.match(
    read(templates.en),
    extractionRegex,
    "en: the template heading matches build.js's extraction regex as a run-time object",
  );
});

// Without naming where it goes, which mechanism takes the criterion over is lost the moment it
// moves to manual verification, and the pre-merge checklist lists operations with no means of
// verification.
test("each language requires naming the mechanism that takes over a delegated criterion", () => {
  const expected = {
    ja: { skill: /引き取る機構/, template: /この基準を引き取る機構/ },
    en: {
      skill: /names the mechanism that takes it on/,
      template: /mechanism that takes this criterion on/,
    },
  };
  for (const [lang, re] of Object.entries(expected)) {
    assert.match(
      read(skills[lang]),
      re.skill,
      `${lang}: SKILL.md carries the rule of naming the mechanism`,
    );
    assert.match(
      read(templates[lang]),
      re.template,
      `${lang}: the template asks for the mechanism`,
    );
  }
});

// The extraction regex is read from the English build.js alone, so the seam test above passes even
// when the .ja side is left behind. MIRROR.md makes .ja canonical, so their agreement is pinned
// here.
test("both languages' build.js carry the same manual verification extraction regex", () => {
  const literalOf = (path) => {
    const m = read(path).match(/manualHeading\s*=\s*body\.match\((\/.+\/m)\)/);
    assert.ok(m, `the extraction regex line is readable from ${path}`);
    return m[1];
  };
  assert.equal(
    literalOf(join(root, ".ja", "workflows", "build.js")),
    literalOf(join(root, "workflows", "build.js")),
    "the ja and en build.js carry the same regex literal",
  );
});

test("SKILL.md and the template use the same heading word", () => {
  const headingTokens = { ja: "実機確認", en: "Manual verification" };
  for (const [lang, token] of Object.entries(headingTokens)) {
    const templateDoc = read(templates[lang]);
    assert.ok(
      templateDoc.includes(`### ${token}`),
      `${lang}: the template carries a ### ${token} heading`,
    );

    const skillDoc = read(skills[lang]);
    assert.ok(
      skillDoc.includes(`\`### ${token}\``),
      `${lang}: SKILL.md references the same heading word as the template, in backticks`,
    );
  }
});
