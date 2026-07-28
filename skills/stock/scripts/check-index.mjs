// Verifies each row of docs/REFERENCE_INDEX.md as dangling-path (referenced path does not
// exist) / no-match (glob matches no tracked file). The glob rule follows the same rule as
// workflows/code.js's reference-index section (`**/` also matches zero directory levels;
// `*` does not cross `/`).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
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

// Only `**/` and `*` are supported. A bare `**` (not followed by `/`) tokenizes into two
// `*` tokens and degrades to single-segment matching, so it is excluded as unsupported
// (same rule as workflows/code.js).
const SUPPORTED_GLOB_CHARS = /^[\w.\-/*]*$/;
const BARE_DOUBLE_STAR = /\*\*(?!\/)/;

// Reuses the readability skill's already-defined function-line-count threshold (<=30,
// rationale: readable within one screen) as the line count for "one screen" (ADR-0091).
const SIZE_THRESHOLD_LINES = 30;

export function checkIndex({ table, exists, trackedFiles }) {
  const lineCount = table.split("\n").length;
  const size = { lines: lineCount, warning: lineCount > SIZE_THRESHOLD_LINES };

  const dataLines = table
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"))
    .slice(2);
  const rows = dataLines
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
    .filter((cells) => cells.length === 3)
    .map(([glob, description, path]) => ({ glob, description, path }));

  // A `-` row (unconditional candidate) and a row with an unsupported glob are excluded
  // from the drift check (dangling/no-match). An unsupported row is listed separately as
  // unsupported; a `-` row appears in neither list.
  const isUnsupportedGlob = (glob) =>
    !SUPPORTED_GLOB_CHARS.test(glob) || BARE_DOUBLE_STAR.test(glob);
  const unsupported = rows.filter((row) => row.glob !== "-" && isUnsupportedGlob(row.glob));
  const driftTargets = rows.filter((row) => row.glob !== "-" && !isUnsupportedGlob(row.glob));

  const dangling = driftTargets.filter((row) => !exists(row.path));

  const noMatch = driftTargets.filter((row) => {
    const matcher = globToRegExp(normalizeMatchPath(row.glob));
    return !trackedFiles.some((file) => matcher.test(normalizeMatchPath(file)));
  });

  // Every row, including `-` rows, carries a real path in the path column (unlike the glob
  // column, `-` is not allowed there; see REFERENCE_INDEX_FORMAT.md). The referenced check
  // compares against this full-row path set.
  const referencedPaths = new Set(rows.map((row) => normalizeMatchPath(row.path)));
  const unreferenced = trackedFiles.filter(
    (file) =>
      /^docs\/.*\.md$/.test(normalizeMatchPath(file)) &&
      !referencedPaths.has(normalizeMatchPath(file)),
  );

  return {
    dangling,
    noMatch,
    unsupported,
    unreferenced,
    size,
    exitCode: dangling.length > 0 ? 1 : 0,
  };
}

// CLI entry point. Receives the repo root and index path via argv and runs checkIndex against
// the tracked-file enumeration from git ls-files. git rev-parse --show-toplevel resolves the
// absolute repo root independent of the invoking cwd, and git ls-files then runs from that repo
// root so the paths line up in repo-root-relative form (a subdirectory launch yields the same
// tracked-file list as a repo-root launch).
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
  const table = readFileSync(indexPathArg, "utf8");
  const exists = (path) => existsSync(join(repoRoot, path));

  const result = checkIndex({ table, exists, trackedFiles });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
