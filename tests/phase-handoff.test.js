// A Phase that names a later Phase and is never named back has handed a value nowhere. PR #289
// was that shape between /qualify's Phase 2 and Phase 4, and build's conformance caught it while
// no test did (#290).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// .ja is canonical (ADR-0073); the English side mirrors it, so one side is the measurement.
const skillsDir = join(root, ".ja", "skills");

// Reviewed once and judged to hand nothing forward. Removing an entry is how a fixed handoff
// gets its guard back, so keep the reason specific enough to re-judge without re-reading.
const CONTROL_ONLY = new Map([
  ["census 1->2", "Phase 1 names Phase 2 as where collection lands, and Phase 2 opens on that set"],
  ["census 3->4", "Phase 3 says an absent DR directory sends every candidate to Phase 4, a route"],
  ["challenge 1->2", "Phase 1 names Phase 2 as the stage that runs after self-resolution, a route"],
  ["pr 1->2", "Phase 1 settles the UI decision that Phase 2 and Phase 3 both read; both name it"],
  ["pr 1->3", "same decision as pr 1->2, read by the pageshot branch"],
  ["qualify 2->3", "Phase 2 says a plan-less issue inspects one axis of Phase 3, a route"],
  ["research 4->7", "Phase 4 says its scratch is what Phase 7 quotes; Phase 7 names the scratch"],
  ["scribe 1->6", "Phase 1 says the write happens inside Phase 6's worktree, a location"],
  ["scribe 2->3", "Phase 2 says an empty candidates file still advances to Phase 3, a route"],
  ["scribe 5->6", "Phase 5 says the change is prepared for Phase 6 to write, a location"],
  ["slice 2->3", "Phase 2 says the coverage check surfaces in what Phase 3 presents, a route"],
]);

const phaseSections = (doc) => {
  const parts = doc.split(/^## (Phase \d+[^\n]*)$/m);
  const out = new Map();
  for (let i = 1; i < parts.length; i += 2) {
    out.set(Number(parts[i].match(/Phase (\d+)/)[1]), parts[i + 1]);
  }
  return out;
};

const key = (name, from, to) => `${name} ${from}->${to}`;

const crossReferences = async () => {
  const names = (await readdir(skillsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name);
  const refs = [];
  for (const name of names) {
    let doc;
    try {
      doc = await readFile(join(skillsDir, name, "SKILL.md"), "utf8");
    } catch {
      continue;
    }
    for (const [from, body] of phaseSections(doc)) {
      for (const m of body.matchAll(/Phase (\d+)/g)) {
        const to = Number(m[1]);
        if (to !== from) refs.push({ name, from, to });
      }
    }
  }
  return { refs, pairs: new Set(refs.map((r) => key(r.name, r.from, r.to))) };
};

// A later Phase citing an earlier one reads a result that already exists, so only a forward
// reference needs a landing point.
test("a Phase that hands something forward is named back by the Phase that receives it", async () => {
  const { refs, pairs } = await crossReferences();
  const unanswered = [
    ...new Set(
      refs
        .filter((r) => r.to > r.from && !pairs.has(key(r.name, r.to, r.from)))
        .map((r) => key(r.name, r.from, r.to))
        .filter((k) => !CONTROL_ONLY.has(k)),
    ),
  ].sort();
  assert.deepEqual(
    unanswered,
    [],
    `a forward reference with no landing point. Write the source into the receiving Phase, or add it to CONTROL_ONLY with the reason:\n${unanswered.join("\n")}`,
  );
});

// An allowlist nobody prunes stops being a record of judgement and becomes noise.
test("every CONTROL_ONLY entry still names a forward reference that exists", async () => {
  const { pairs } = await crossReferences();
  const stale = [...CONTROL_ONLY.keys()].filter((k) => !pairs.has(k)).sort();
  assert.deepEqual(
    stale,
    [],
    `CONTROL_ONLY holds entries that no longer occur:\n${stale.join("\n")}`,
  );
});
