// gate.ts documents its flags in a leading comment (the "Usage:" line and the
// "options:" list) and enforces them through three module-private Sets. A rename on
// one side without the other silently drifts: the comment promises a flag the CLI no
// longer accepts, or the CLI silently accepts a flag no comment explains. This test
// keeps the two sides equal in both directions, for both the English source and its
// .ja mirror.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const read = (relative) => readFileSync(join(root, relative), "utf8");

const GATE_FILES = ["workflows/_lib/gate.ts", ".ja/workflows/_lib/gate.ts"];

// The flag names the leading comment documents: the "Usage:" synopsis line plus the
// "options:" list, read as text up to the file's first import.
const documentedFlagsIn = (source, label) => {
  const match = source.match(/\/\/ Usage:[\s\S]*?\nimport \{/);
  assert.ok(match, `${label} carries no leading Usage/options comment in the expected shape`);
  return new Set([...match[0].matchAll(/--[a-z][a-z-]*/g)].map((entry) => entry[0]));
};

// gate.ts's SINGLE_FLAGS / REPEATABLE_FLAGS / BOOLEAN_FLAGS are module-private (not
// exported), so this parses the source as text rather than importing it -- the same
// approach capsIn in unit-caps-ssot.test.js takes for UNIT_CAPS.
//
// Matches each `const ..._FLAGS = new Set([...]);` literal and unions their entries.
const setFlagsIn = (source, label) => {
  const matches = [...source.matchAll(/const [A-Z_]+_FLAGS = new Set\(\[([\s\S]*?)\]\);/g)];
  assert.ok(matches.length > 0, `${label} carries no flag-Set literal in the expected shape`);
  const flags = matches
    .flatMap((match) => [...match[1].matchAll(/--[a-z][a-z-]*/g)])
    .map((entry) => entry[0]);
  return new Set(flags);
};

// No flag the comment documents alone, and no flag the Sets accept alone.
const flagsMatch = (documented, actual) => {
  const extra = [...actual].filter((flag) => !documented.has(flag));
  const missing = [...documented].filter((flag) => !actual.has(flag));
  return extra.length === 0 && missing.length === 0;
};

// Drops every header line naming `flag`, leaving the Set literals untouched.
const withCommentLineRemoved = (source, flag) =>
  source
    .split(/\r\n|\r|\n/)
    .filter((line) => !(line.trimStart().startsWith("//") && line.includes(flag)))
    .join("\n");

test("the documented flag names and the flag names in the three Sets are equal in both directions", () => {
  for (const relative of GATE_FILES) {
    const source = read(relative);
    const documented = documentedFlagsIn(source, relative);
    const actual = setFlagsIn(source, relative);
    assert.ok(
      flagsMatch(documented, actual),
      `${relative}: the comment's flag names and the three Sets' flag names diverge`,
    );
  }
});

test("a flag added to a Set alone fails the comparison", () => {
  for (const relative of GATE_FILES) {
    const source = read(relative);
    const anchor = 'const BOOLEAN_FLAGS = new Set(["--calibrate"]);';
    const mutated = source.replace(
      anchor,
      'const BOOLEAN_FLAGS = new Set(["--calibrate", "--dry-run"]);',
    );
    assert.notEqual(
      mutated,
      source,
      `${relative}: the BOOLEAN_FLAGS anchor was not found for the fixture mutation`,
    );
    const documented = documentedFlagsIn(source, relative);
    const actual = setFlagsIn(mutated, relative);
    assert.ok(
      !flagsMatch(documented, actual),
      `${relative}: a flag added to a Set alone should make the comparison fail`,
    );
  }
});

test("a flag line removed from the comment alone fails the comparison", () => {
  for (const relative of GATE_FILES) {
    const source = read(relative);
    const mutated = withCommentLineRemoved(source, "--tail-bytes");
    assert.notEqual(
      mutated,
      source,
      `${relative}: no header line names --tail-bytes for the fixture mutation`,
    );
    const documented = documentedFlagsIn(mutated, relative);
    const actual = setFlagsIn(source, relative);
    assert.ok(
      !flagsMatch(documented, actual),
      `${relative}: a flag line removed from the comment alone should make the comparison fail`,
    );
  }
});

// gate.ts also documents the default values of --timeout-ms and --tail-bytes in the
// same leading comment, and DEFAULT_TIMEOUT_MS / DEFAULT_TAIL_BYTES back them with a
// numeric-literal underscore separator the comment does not use (600_000 vs 600000).
// A rename or a value change on one side without the other silently drifts the same
// way the flag names above do. This keeps the comment, the two constants, and the
// parseArgs initializers that seed ValidatedOptions from them all equal, for both the
// English source and its .ja mirror.

// Drops `_` separators before parsing, so 600_000 and 600000 read as the same number.
const numberFrom = (literal) => Number(literal.replace(/_/g, ""));

// The DEFAULT_TIMEOUT_MS / DEFAULT_TAIL_BYTES constant declarations, parsed as source
// text rather than imported -- gate.ts has a top-level `isMainModule` side effect, and
// the same approach capsIn in unit-caps-ssot.test.js and setFlagsIn above take for
// their own module-private literals.
const declaredDefaultsIn = (source, label) => {
  const match = source.match(
    /export const DEFAULT_TIMEOUT_MS = ([\d_]+);\s*\nexport const DEFAULT_TAIL_BYTES = ([\d_]+);/,
  );
  assert.ok(
    match,
    `${label} carries no DEFAULT_TIMEOUT_MS/DEFAULT_TAIL_BYTES declaration in the expected shape`,
  );
  return { timeout_ms: numberFrom(match[1]), tail_bytes: numberFrom(match[2]) };
};

// The defaults the leading comment states for --timeout-ms and --tail-bytes.
const documentedDefaultsIn = (source, label) => {
  const timeoutMatch = source.match(/--timeout-ms N\s+.*\(default: ([\d_]+)\)/);
  const tailMatch = source.match(/--tail-bytes N\s+.*\(default: ([\d_]+)\)/);
  assert.ok(
    timeoutMatch && tailMatch,
    `${label} carries no --timeout-ms/--tail-bytes default comment in the expected shape`,
  );
  return { timeout_ms: numberFrom(timeoutMatch[1]), tail_bytes: numberFrom(tailMatch[1]) };
};

// parseArgs's own timeout_ms/tail_bytes initializers, resolved to numbers. Each reads
// as the DEFAULT_TIMEOUT_MS/DEFAULT_TAIL_BYTES identifier today; a bare numeric
// literal resolves directly, and any other token resolves to NaN so a drift there
// fails the comparison instead of passing silently.
const parseArgsDefaultsIn = (source, label) => {
  const match = source.match(
    /timeout_ms:\s*([A-Za-z0-9_]+),\s*\n\s*tail_bytes:\s*([A-Za-z0-9_]+),/,
  );
  assert.ok(
    match,
    `${label} carries no parseArgs timeout_ms/tail_bytes initializer in the expected shape`,
  );
  const declared = declaredDefaultsIn(source, label);
  const resolve = (token, identifier, value) =>
    token === identifier ? value : /^[\d_]+$/.test(token) ? numberFrom(token) : NaN;
  return {
    timeout_ms: resolve(match[1], "DEFAULT_TIMEOUT_MS", declared.timeout_ms),
    tail_bytes: resolve(match[2], "DEFAULT_TAIL_BYTES", declared.tail_bytes),
  };
};

// No default the comment states alone, and no default the other side carries alone.
const defaultsMatch = (documented, actual) =>
  documented.timeout_ms === actual.timeout_ms && documented.tail_bytes === actual.tail_bytes;

test("the documented defaults equal DEFAULT_TIMEOUT_MS, DEFAULT_TAIL_BYTES, and the parseArgs initializers", () => {
  for (const relative of GATE_FILES) {
    const source = read(relative);
    const documented = documentedDefaultsIn(source, relative);
    const declared = declaredDefaultsIn(source, relative);
    const parsed = parseArgsDefaultsIn(source, relative);
    assert.ok(
      defaultsMatch(documented, declared),
      `${relative}: the comment's defaults diverge from DEFAULT_TIMEOUT_MS/DEFAULT_TAIL_BYTES`,
    );
    assert.ok(
      defaultsMatch(documented, parsed),
      `${relative}: the comment's defaults diverge from the parseArgs initializers`,
    );
  }
});

test("a changed default constant fails the comparison", () => {
  for (const relative of GATE_FILES) {
    const source = read(relative);
    const anchor = "export const DEFAULT_TIMEOUT_MS = 600_000;";
    const mutated = source.replace(anchor, "export const DEFAULT_TIMEOUT_MS = 700_000;");
    assert.notEqual(
      mutated,
      source,
      `${relative}: the DEFAULT_TIMEOUT_MS anchor was not found for the fixture mutation`,
    );
    const documented = documentedDefaultsIn(source, relative);
    const declared = declaredDefaultsIn(mutated, relative);
    assert.ok(
      !defaultsMatch(documented, declared),
      `${relative}: a changed default constant should make the comparison fail`,
    );
  }
});

// The two tests below single out .ja/workflows/_lib/gate.ts rather than looping
// GATE_FILES, the way unit-caps-ssot.test.js's second loop singles out each skill
// path. --timeout-ms and --tail-bytes are language-independent tokens, so the
// surrounding Japanese prose must not interfere with documentedFlagsIn /
// documentedDefaultsIn extracting them.
const JA_GATE = ".ja/workflows/_lib/gate.ts";

test("the same comparison runs over .ja/workflows/_lib/gate.ts", () => {
  const source = read(JA_GATE);

  const documentedFlags = documentedFlagsIn(source, JA_GATE);
  const actualFlags = setFlagsIn(source, JA_GATE);
  assert.ok(
    flagsMatch(documentedFlags, actualFlags),
    `${JA_GATE}: the comment's flag names and the three Sets' flag names diverge`,
  );

  const documentedDefaults = documentedDefaultsIn(source, JA_GATE);
  const declaredDefaults = declaredDefaultsIn(source, JA_GATE);
  const parsedDefaults = parseArgsDefaultsIn(source, JA_GATE);
  assert.ok(
    defaultsMatch(documentedDefaults, declaredDefaults),
    `${JA_GATE}: the comment's defaults diverge from DEFAULT_TIMEOUT_MS/DEFAULT_TAIL_BYTES`,
  );
  assert.ok(
    defaultsMatch(documentedDefaults, parsedDefaults),
    `${JA_GATE}: the comment's defaults diverge from the parseArgs initializers`,
  );
});

test("a default changed in the .ja comment alone fails the comparison", () => {
  const source = read(JA_GATE);
  const enSourceBefore = read("workflows/_lib/gate.ts");

  const anchor = "コマンドのタイムアウト、ミリ秒 (default: 600000)";
  const mutated = source.replace(anchor, anchor.replace("600000", "700000"));
  assert.notEqual(
    mutated,
    source,
    `${JA_GATE}: the --timeout-ms default comment anchor was not found for the fixture mutation`,
  );

  const documented = documentedDefaultsIn(mutated, JA_GATE);
  const declared = declaredDefaultsIn(source, JA_GATE);
  assert.ok(
    !defaultsMatch(documented, declared),
    `${JA_GATE}: a default changed in the .ja comment alone should make the comparison fail`,
  );

  // The mutation touches only the in-memory .ja string; the EN file on disk, and the
  // real .ja file on disk, are untouched by this fixture.
  assert.equal(
    read("workflows/_lib/gate.ts"),
    enSourceBefore,
    "mutating the .ja fixture in memory must not touch the EN file on disk",
  );
});
