// docs/REFERENCE_INDEX.md の各行を dangling-path (参照先が実在しない) / no-match (glob が
// tracked ファイルに一致しない) として検証する。glob 判定は workflows/code.js の
// reference-index 節 (`**/` はゼロ階層にも一致、`*` は `/` を跨がない) と同じ規則にする。
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

// glob 行・trackedFiles のどちらが接頭辞を持っていても揃うように、先頭の `./` `/` を剥がす。
const normalizeMatchPath = (p) => String(p).replace(/^(?:\.\/|\/)+/, "");

// 対応するのは `**/` と `*` のみ。裸の `**` (`/` を伴わない) はトークン化すると `*` 2 個に
// 分解され単一階層一致に劣化するので、未対応として除外する (workflows/code.js と同じ規則)。
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

  // `-` 行 (無条件候補) と未対応 glob の行は drift 判定 (dangling/no-match) から除外する。
  // 未対応行は unsupported として別掲するが、`-` 行はどちらの一覧にも出さない。
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
