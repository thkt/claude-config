import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LANGS = ["ja", "en"];
const at = (lang, ...parts) => join(root, ...(lang === "ja" ? [".ja"] : []), ...parts);

function read(path) {
  assert.ok(existsSync(path), `${path} exists`);
  return readFileSync(path, "utf8");
}

const skill = (lang) => read(at(lang, "skills", "pr", "SKILL.md"));
const template = (lang) => read(at(lang, "skills", "pr", "templates", "pr.md"));
const pageshot = (lang) => read(at(lang, "skills", "use-workflow-pageshot", "SKILL.md"));

// pr reads pageshot's stdout line and branches on the mode token. A second spelling on either side
// leaves the branch matching nothing, and pr then reports no artifact for a capture that ran.
const MODE_LINES = ["mode=screenshot", "mode=video", "mode=failed"];

test("the mode tokens pr branches on are the ones pageshot emits", () => {
  for (const lang of LANGS) {
    const helper = pageshot(lang);
    const caller = skill(lang);
    for (const token of MODE_LINES) {
      assert.ok(helper.includes(token), `${lang}: pageshot emits ${token}`);
      assert.ok(caller.includes(token), `${lang}: pr SKILL.md branches on ${token}`);
    }
    assert.doesNotMatch(helper, /mode: (failed|screenshot|video)/, `${lang}: no second spelling`);
  }
});

// The pageshot artifact reaches the PR through gh's --attach flag. With the flag gone from the
// create step, the capture runs and the PR goes up without it, and the only remaining signal is
// a stale instruction to upload the file by hand.
test("the create step attaches the pageshot artifact through gh --attach", () => {
  for (const lang of LANGS) {
    const doc = skill(lang);
    assert.match(doc, /--attach "<path>#<title>"/, `${lang}: the screenshot branch passes the artifact and alt text`);
    assert.match(doc, /--attach "<path>"/, `${lang}: the video branch passes the artifact without alt text`);
    assert.doesNotMatch(doc, /drag|ドラッグ/, `${lang}: no manual upload instruction remains`);
    assert.doesNotMatch(pageshot(lang), /manual|手動/, `${lang}: pageshot no longer hands off to a manual step`);
  }
});

// The order itself is checked. Matching sets in a swapped order change which template gets used.
const PRIORITY = [
  ".github/pull_request_template.md",
  "pull_request_template.md",
  "docs/pull_request_template.md",
  "PULL_REQUEST_TEMPLATE/",
];
const BASE_BLOCK = /## Base (?:Branch Detection|ブランチ検出)[\s\S]*?```bash\n([\s\S]*?)```/;
const BODY_RULES = "references/pr-writing.md";

// /pr's SKILL.md and build.js's ship prompt both write a PR body. The ship agent is a subagent and
// cannot be handed the skill, so the rules can only be shared as a file both point at. With either
// side stating them inline instead, the two drift and nothing fails at run time.
test("both /pr and build.js's ship prompt point at the shared body rules", () => {
  for (const lang of LANGS) {
    for (const [name, path] of [
      ["pr SKILL.md", at(lang, "skills", "pr", "SKILL.md")],
      ["build.js", at(lang, "workflows", "build.js")],
    ]) {
      assert.ok(read(path).includes(BODY_RULES), `${lang}: ${name} points at ${BODY_RULES}`);
    }
  }
});

// The rules are only shared if the file carries them. The priority order is the part that decides
// which skeleton gets used, so a swapped order changes the output without any other signal.
test("the shared body rules carry the template priority in order", () => {
  for (const lang of LANGS) {
    const rules = read(at(lang, "skills", "pr", "references", "pr-writing.md"));
    const found = PRIORITY.map((entry) => rules.indexOf(entry));
    found.forEach((idx, i) => {
      assert.ok(idx >= 0, `${lang}: the rules write ${PRIORITY[i]}`);
    });
    assert.deepEqual(found, [...found].sort((a, b) => a - b), `${lang}: it keeps the order`);
  }
});

// Downstream reads the bundled template's required sections by heading name: use-workflow-pageshot
// reads How to Test, and Related carries the issue link through Closes #. A rename severs those
// links silently.
test("the bundled template carries the required sections downstream depends on", () => {
  for (const lang of LANGS) {
    const tpl = template(lang);
    for (const heading of ["## How to Test", "## Related", "## Review focus"]) {
      assert.ok(tpl.includes(heading), `${lang}: the skeleton carries ${heading}`);
    }
    assert.ok(tpl.includes("Closes #"), `${lang}: Related carries Closes #`);
  }
});

// build.js's ship prompt names the bundled template by a literal path. Moving the path leaves the
// reference pointing at nothing.
test("the shared rules reach the bundled template by a path that resolves", () => {
  for (const lang of LANGS) {
    const rulesPath = at(lang, "skills", "pr", "references", "pr-writing.md");
    const rel = read(rulesPath).match(/`(\.\.\/[^`]+)`/)?.[1];
    assert.ok(rel, `${lang}: the rules name the bundled skeleton by a relative path`);
    assert.ok(existsSync(join(dirname(rulesPath), rel)), `${lang}: ${rel} resolves from the rules`);
  }
});

// The create step passes the body through --body-file because a template-derived body carries
// backticks and `$`. Without a tool that writes a file, that step cannot run, and the skill stops
// at the last step with no way forward.
test("allowed-tools grants a way to write the body file the create step needs", () => {
  for (const lang of LANGS) {
    const doc = skill(lang);
    const tools = doc.match(/^allowed-tools: (.+)$/m)?.[1] ?? "";
    assert.match(doc, /--body-file/, `${lang}: the create step uses --body-file`);
    assert.ok(
      /Bash\(cat:\*\)/.test(tools) || /\bWrite\b/.test(tools),
      `${lang}: allowed-tools carries cat or Write (actual: ${tools})`,
    );
  }
});

// The pageshot skill reads two things out of the body: a Preview URL line and a numbered How to
// Test section. SKILL.md states the requirement and the bundled template is what supplies it, so
// dropping either side leaves the handoff failing at mode=failed with nothing naming the cause.
test("the pageshot handoff names the same two items in SKILL.md and the bundled template", () => {
  for (const lang of LANGS) {
    const doc = skill(lang);
    const tpl = template(lang);
    assert.match(doc, /Preview URL/, `${lang}: SKILL.md names the Preview URL line`);
    assert.match(doc, /How to Test/, `${lang}: SKILL.md names the How to Test section`);
    assert.match(tpl, /^Preview URL:/m, `${lang}: the skeleton carries the Preview URL line`);
    assert.match(tpl, /^## How to Test$/m, `${lang}: the skeleton carries How to Test`);
  }
});

// The reflog lookup is what makes the base the branch this one was cut from. Falling back to
// origin's default alone would put every PR against main regardless of where it branched, and the
// ancestor check is what stops a stale reflog entry from becoming the base.
test("base detection reads the reflog and guards the result with an ancestor check", () => {
  for (const lang of LANGS) {
    const block = skill(lang).match(BASE_BLOCK)?.[1];
    assert.ok(block, `${lang}: the detection carries a bash block`);
    assert.match(block, /git reflog/, `${lang}: it reads the reflog`);
    assert.match(block, /--is-ancestor/, `${lang}: it guards the result against HEAD`);
    assert.match(block, /symbolic-ref refs\/remotes\/origin\/HEAD/, `${lang}: it falls back`);
    assert.match(block, /BASE=\$\{BASE:-main\}/, `${lang}: main is the last resort`);
  }
});

// Nothing asks before the PR goes up. Draft is what stands between an unreviewed body and a PR
// requesting review, and the base on the result line is the only place the detected branch is
// shown. Dropping either leaves the run with no signal at all.
test("the PR goes up as a draft, since nothing confirms before creating it", () => {
  for (const lang of LANGS) {
    const doc = skill(lang);
    assert.match(doc, /gh pr create --draft/, `${lang}: the create step passes --draft`);
    assert.doesNotMatch(doc, /AskUserQuestion/, `${lang}: no step asks for confirmation`);
    assert.match(doc, /\(base: <base>\)/, `${lang}: the result line shows the detected base`);
  }
});

// The title rule differs from a commit subject: no Conventional Commits prefix. With build.js
// stating its own rule, its PRs carried a `feat:` prefix that /pr strips, so the two produced
// different titles for the same work.
test("the title rule lives with the shared writing rules, not in build.js", () => {
  for (const lang of LANGS) {
    const rules = read(at(lang, "skills", "pr", "references", "pr-writing.md"));
    assert.match(rules, /^## (Title|タイトル)$/m, `${lang}: the rules carry a title section`);
    assert.match(rules, /feat:/, `${lang}: it names the prefix to strip`);
    const ship = read(at(lang, "workflows", "build.js"));
    assert.doesNotMatch(ship, /Conventional Commits subject/, `${lang}: build.js states no title rule`);
  }
});
