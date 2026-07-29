// Verifies each row of docs/REFERENCE_INDEX.md. The glob rule duplicates the one in
// workflows/code.js's reference-index section; glob-parity.test.js watches for drift.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const globToRegExp = (glob) => {
  const body = glob
    .split(/(\*\*\/|\*)/)
    .map((part) => {
      if (part === "**/") return "(?:.*/)?";
      if (part === "*") return "[^/]*";
      return part.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${body}$`);
};

// Strip leading `./` and `/` from both sides before matching (aligned no matter which of
// the glob row or trackedFiles carries the prefix).
const normalizeMatchPath = (p) => String(p).replace(/^(?:\.\/|\/)+/, "");

// A bare `**` (not followed by `/`) tokenizes into two `*` tokens and degrades to
// single-segment matching, so it is excluded as unsupported even though it passes the
// character-set check.
const SUPPORTED_GLOB_CHARS = /^[\w.\-/*]*$/;
const BARE_DOUBLE_STAR = /\*\*(?!\/)/;

// Reuses the readability skill's already-defined function-line-count threshold (<=30,
// rationale: readable within one screen) as the line count for "one screen" (ADR-0091).
const SIZE_THRESHOLD_LINES = 30;

// Docs that are not conventions for an implementation agent to read are kept out of the
// candidates. A decision record (DR) preserves the history behind a past call, and feeding
// those to implementation would eat the one-screen threshold instantly. An index (README)
// and a work-in-progress candidate holder are not conventions either.
const EXCLUDED_FROM_CANDIDATES = [/^docs\/decisions\//, /(^|\/)README\.md$/, /(^|\/)_[^/]*\.md$/];

// An absent index is not an error but the initial state before indexing begins. It is treated
// as an empty table, returning a report with only the candidate-proposal input (unreferenced)
// filled in. found carries that distinction to the caller.
export function checkIndex({ table, exists, trackedFiles, indexPath, found = true }) {
  // size watches the index table's line count (ADR-0091). code.js's reader also extracts
  // the table body alone, so headings and prose around the table are not counted.
  const tableLines = table
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  const size = { lines: tableLines.length, warning: tableLines.length > SIZE_THRESHOLD_LINES };

  const dataLines = tableLines.slice(2);
  const rows = dataLines
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
    .filter((cells) => cells.length === 3)
    .map(([glob, description, path]) => ({ glob, description, path }));

  // A `-` row carries no glob, so running it through the drift check would always report
  // no-match. An unsupported row invites the same misjudgment, so it is likewise excluded
  // from drift and listed separately as unsupported.
  const isUnsupportedGlob = (glob) =>
    !SUPPORTED_GLOB_CHARS.test(glob) || BARE_DOUBLE_STAR.test(glob);
  const unsupported = rows.filter((row) => row.glob !== "-" && isUnsupportedGlob(row.glob));
  const driftTargets = rows.filter((row) => row.glob !== "-" && !isUnsupportedGlob(row.glob));

  const dangling = driftTargets.filter((row) => !exists(row.path));

  const noMatch = driftTargets.filter((row) => {
    const matcher = globToRegExp(normalizeMatchPath(row.glob));
    return !trackedFiles.some((file) => matcher.test(normalizeMatchPath(file)));
  });

  // Every row, `-` rows included, carries a real path in the path column, so the referenced
  // check compares against the full-row path set. The index file itself can never appear in
  // its own path column, so without the exclusion it would stay in unreferenced permanently.
  const referencedPaths = new Set(rows.map((row) => normalizeMatchPath(row.path)));
  const indexSelf = indexPath ? normalizeMatchPath(indexPath) : null;
  const unreferenced = trackedFiles.filter(
    (file) =>
      /^docs\/.*\.md$/.test(normalizeMatchPath(file)) &&
      normalizeMatchPath(file) !== indexSelf &&
      !EXCLUDED_FROM_CANDIDATES.some((pattern) => pattern.test(normalizeMatchPath(file))) &&
      !referencedPaths.has(normalizeMatchPath(file)),
  );

  return {
    found,
    dangling,
    noMatch,
    unsupported,
    unreferenced,
    size,
    exitCode: dangling.length > 0 ? 1 : 0,
  };
}

// git rev-parse --show-toplevel resolves an absolute repo root independent of the invoking
// cwd, and git ls-files runs from that repo root. A subdirectory launch yields the same list
// as a repo-root launch.
function main([repoRootArg, indexPathArg]) {
  const repoRootHint = resolve(process.cwd(), repoRootArg);
  const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: repoRootHint,
    encoding: "utf8",
  }).trim();
  const trackedFiles = execFileSync("git", ["ls-files"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter((line) => line.length > 0);
  const absoluteIndexPath = resolve(process.cwd(), indexPathArg);
  const found = existsSync(absoluteIndexPath);
  const table = found ? readFileSync(absoluteIndexPath, "utf8") : "";
  const exists = (path) => existsSync(join(repoRoot, path));
  // git rev-parse returns a symlink-resolved absolute path, so realpath the index side too
  // before relativizing (keeps the relative path aligned across macOS's /tmp -> /private/tmp).
  const indexPath = found ? relative(repoRoot, realpathSync(absoluteIndexPath)) : indexPathArg;

  const result = checkIndex({ table, exists, trackedFiles, indexPath, found });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.exitCode;
}

const INDEX_HEADER = ["| glob | description | path |", "| --- | --- | --- |"];

// Appends adopted rows to the index. Unless the header is exactly 2 lines it does not line up
// with the parser, which unconditionally skips the first 2 lines: one data row gets eaten, or
// the separator row is picked up as a ghost row (references/reference-index-format.md § Table
// constraint). Emit it deterministically here rather than having it hand-written.
export function appendRows(existingTable, rows) {
  const existingRows = existingTable
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  const added = rows.map((row) => `| ${row.glob} | ${row.description} | ${row.path} |`);
  return [...(existingRows.length ? existingRows : INDEX_HEADER), ...added].join("\n") + "\n";
}

// Apply mode. Takes the adopted rows as a JSON array of {glob, description, path} and writes
// them back to the index. The adoption itself is already settled by the caller (the human's
// judgment); this only carries out the write.
function applyRows(indexPathArg, rowsJson) {
  const absoluteIndexPath = resolve(process.cwd(), indexPathArg);
  const existing = existsSync(absoluteIndexPath) ? readFileSync(absoluteIndexPath, "utf8") : "";
  const rows = JSON.parse(rowsJson);
  mkdirSync(dirname(absoluteIndexPath), { recursive: true });
  writeFileSync(absoluteIndexPath, appendRows(existing, rows));
  process.stdout.write(`${JSON.stringify({ written: absoluteIndexPath, added: rows.length })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv[0] === "--apply") applyRows(argv[1], argv[2]);
  else main(argv);
}
