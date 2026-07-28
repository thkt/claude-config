// Verifies each row of docs/REFERENCE_INDEX.md as dangling-path (referenced path does not
// exist) / no-match (glob matches no tracked file). The glob rule follows the same rule as
// workflows/code.js's reference-index section (`**/` also matches zero directory levels;
// `*` does not cross `/`).
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

export function checkIndex({ table, exists, trackedFiles }) {
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

  return {
    dangling,
    noMatch,
    unsupported,
    exitCode: dangling.length > 0 ? 1 : 0,
  };
}
