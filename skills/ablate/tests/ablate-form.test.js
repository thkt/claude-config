// Seam tests for the ablate skill's own documentation boundary: SKILL.md must call scripts
// and write branches only, and the integration that runs the measurement scripts in
// sequence must live in report.py (this unit's contract). T-005 runs the real report.py +
// usage_counts.py across that boundary rather than asserting on a stub, so a call that was
// wired in name only (imported but never invoked, or invoked but never rendered) still
// shows up here. T-006 stays on SKILL.md's own text: a threshold copied into prose, or a
// second call site added alongside report.write_report, are both drift no execution test
// can catch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const at = (lang, ...parts) => join(root, ...(lang === "ja" ? [".ja"] : []), "skills", ...parts);
const pair = (...parts) => ({ ja: at("ja", ...parts), en: at("en", ...parts) });

const skills = pair("ablate", "SKILL.md");
const scriptsDir = join(root, "skills", "ablate", "scripts");
const libDir = join(root, "skills", "_lib");

const eachLanguage = async (paths, check) => {
  for (const [lang, path] of Object.entries(paths)) {
    await check(await readFile(path, "utf8"), lang);
  }
};

// Mirrors report_test.py's own sys.path setup (scripts dir, then skills/_lib) so this drives
// the exact same import shape the real caller uses.
const DRIVER = [
  "import sys, json",
  "from pathlib import Path",
  "sys.path.insert(0, sys.argv[1])",
  "sys.path.insert(0, sys.argv[2])",
  "import report",
  "root = Path(sys.argv[3])",
  "out_dir = Path(sys.argv[4])",
  "path = report.write_report(root, [], out_dir=out_dir)",
  "print(json.dumps(str(path)))",
].join("\n");

// The fixture record shape a real ~/.claude/projects/**/*.jsonl transcript carries, mirroring
// skills/ablate/tests/usage_counts_test.py's own _fire() fixture builder exactly: `command`
// carries the home-relative form the harness actually invokes
// ("~/.claude/hooks/sample_hook.py"), which usage_counts.element_path() strips down to the
// repo-root-relative element path harness_elements.py itself uses.
const fireRecord = (command, timestamp) =>
  JSON.stringify({
    type: "attachment",
    attachment: {
      type: "hook_success",
      hookName: "PreToolUse:Bash",
      hookEvent: "PreToolUse",
      command,
      stdout: "",
      exitCode: 0,
    },
    timestamp,
  });

test("T-005 report.py runs the usage counter and writes the fire counts and last-used dates into the report", async () => {
  const work = mkdtempSync(join(tmpdir(), "ablate-form-"));
  try {
    const repoRoot = join(work, "repo");
    const home = join(work, "home");
    const outDir = join(work, "out");
    const elementPath = "hooks/sample_hook.py";

    // A minimal real harness_elements.POPULATION_GLOBS member ("hooks/**/*.py"), so
    // report.py's own call to the real enumerator independently reports this path.
    mkdirSync(join(repoRoot, "hooks"), { recursive: true });
    writeFileSync(join(repoRoot, "hooks", "sample_hook.py"), "# fixture harness element\n");
    mkdirSync(outDir, { recursive: true });

    // usage_counts.py's own module docstring names the real transcript location as
    // ~/.claude/projects/**/*.jsonl, so the fixture sits under HOME rather than being handed
    // in as a bespoke argument report.py does not (yet) accept.
    const transcriptDir = join(home, ".claude", "projects", "proj-a");
    mkdirSync(transcriptDir, { recursive: true });
    writeFileSync(
      join(transcriptDir, "session-1.jsonl"),
      [
        fireRecord(`~/.claude/${elementPath}`, "2026-08-01T00:00:00.000Z"),
        fireRecord(`~/.claude/${elementPath}`, "2026-08-15T00:00:00.000Z"),
      ].join("\n") + "\n",
    );

    const driverPath = join(work, "driver.py");
    writeFileSync(driverPath, DRIVER);

    const res = spawnSync("python3", [driverPath, scriptsDir, libDir, repoRoot, outDir], {
      encoding: "utf8",
      env: { ...process.env, HOME: home },
    });
    assert.equal(res.status, 0, `report.write_report runs to completion (stderr: ${res.stderr})`);

    const reportPath = JSON.parse(res.stdout.trim());
    const content = await readFile(reportPath, "utf8");
    const elementLine = content.split("\n").find((line) => line.includes(elementPath));
    assert.ok(elementLine, `the fixture element ${elementPath} rides the written report`);

    // Two fires, most recently on 2026-08-15: both must be readable next to the element,
    // not merely present somewhere else in the document.
    assert.match(
      elementLine,
      /2026-08-15/,
      "the fixture element's row carries its most recent fire date",
    );
    assert.match(elementLine, /\b2\b/, "the fixture element's row carries its fire count");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("T-006 the skill document names one invocation route and no threshold of its own", () =>
  eachLanguage(skills, (doc, lang) => {
    // Counted from the first phase heading down, not over the whole document: the criteria
    // registry above the phases points at the same script on purpose. A second mention among
    // the phases is a second call site for it, which is the drift this contract rules out.
    const phaseBody = doc.slice(doc.search(/^## Phase 1:/m));
    const mentions = (phaseBody.match(/usage_counts/g) || []).length;
    assert.equal(
      mentions,
      1,
      `${lang}: usage_counts is named exactly once among the phases (found ${mentions})`,
    );

    // A phase added just for the usage counter would be a second invocation route running
    // alongside Phase 3's report.write_report call, rather than folded into it.
    const phases = [...doc.matchAll(/^## Phase (\d+):/gm)].map((m) => Number(m[1]));
    assert.deepEqual(
      phases,
      [1, 2, 3],
      `${lang}: no phase is added to launch the usage counter on its own`,
    );

    // The measurement window and the rare-by-design allowance stay script constants
    // (skills/ablate/scripts/usage_counts.py); copying either into prose here is the second
    // half of this unit's contract, the same rule already stated for arms.py / verdict.py.
    assert.doesNotMatch(
      doc,
      /\b90\b/,
      `${lang}: the measurement-window day count is not copied into this body`,
    );
    assert.doesNotMatch(
      doc,
      /RARE_BY_DESIGN/,
      `${lang}: the rare-by-design set is not spelled out in this body`,
    );
  }));

// The one claim the skeleton still makes on its own: which sections _render emits, and in
// what order. Columns and row labels were removed from it because nothing pinned them, and
// the Harness Elements table had already fallen two columns behind _render by the time this
// test was written.
const templates = pair("ablate", "templates", "report-template.md");
const reportPy = join(root, "skills", "ablate", "scripts", "report.py");

test("T-007 the skeleton's sections match the ones report.py renders, in order", async () => {
  const rendered = [...(await readFile(reportPy, "utf8")).matchAll(/lines \+= \["## ([^"]+)"/g)].map(
    (m) => m[1],
  );
  assert.ok(rendered.length > 0, "report.py's section headings are extractable");

  await eachLanguage(templates, (doc, lang) => {
    const fence = doc.split("```markdown")[1];
    assert.ok(fence, `${lang}: the skeleton carries a markdown fence`);
    const sections = [...fence.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.deepEqual(sections, rendered, `${lang}: the skeleton and _render name the same sections`);
  });
});

// Columns live in _render alone. A header row copied back into the skeleton is the drift
// this unit removed, so its absence is what gets held.
test("T-008 the skeleton names no table column of its own", () =>
  eachLanguage(templates, (doc, lang) => {
    const fence = doc.split("```markdown")[1] ?? "";
    const tableRows = fence.split("\n").filter((line) => line.trim().startsWith("|"));
    assert.deepEqual(tableRows, [], `${lang}: the skeleton carries no table row`);
  }));
