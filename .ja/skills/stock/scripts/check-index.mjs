// docs/REFERENCE_INDEX.md の各行を dangling-path (参照先が実在しない) / no-match (glob が
// tracked ファイルに一致しない) として検証する。glob 判定は workflows/code.js の
// reference-index 節 (`**/` はゼロ階層にも一致、`*` は `/` を跨がない) と同じ規則にする。
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
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

// glob 行・trackedFiles のどちらが接頭辞を持っていても揃うように、先頭の `./` `/` を剥がす。
const normalizeMatchPath = (p) => String(p).replace(/^(?:\.\/|\/)+/, "");

// 対応するのは `**/` と `*` のみ。裸の `**` (`/` を伴わない) はトークン化すると `*` 2 個に
// 分解され単一階層一致に劣化するので、未対応として除外する (workflows/code.js と同じ規則)。
const SUPPORTED_GLOB_CHARS = /^[\w.\-/*]*$/;
const BARE_DOUBLE_STAR = /\*\*(?!\/)/;

// 「1 画面」の行数を、use-context-reviewer-readability スキルが既に定義する関数行数の
// 閾値 (≤30、根拠: 1 画面の可読性) から流用する (ADR-0091)。
const SIZE_THRESHOLD_LINES = 30;

export function checkIndex({ table, exists, trackedFiles, indexPath }) {
  // size が見張るのは index 表の行数 (ADR-0091)。code.js の reader が抽出するのも表本文
  // だけなので、表の前後の見出しや散文は数えない。
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

  // path 列は `-` 行を含む全行が実パスを持つ (glob 列とは異なり `-` を許さない、
  // REFERENCE_INDEX_FORMAT.md)。参照済み判定はこの全行の path 集合と比較する。index
  // ファイル自身は自分の path 列に載れないため、除外しないと恒久的に unreferenced に残る。
  const referencedPaths = new Set(rows.map((row) => normalizeMatchPath(row.path)));
  const indexSelf = indexPath ? normalizeMatchPath(indexPath) : null;
  const unreferenced = trackedFiles.filter(
    (file) =>
      /^docs\/.*\.md$/.test(normalizeMatchPath(file)) &&
      normalizeMatchPath(file) !== indexSelf &&
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

// CLI エントリポイント。repo root と index パスを argv で受け、git ls-files 由来のファイル
// 列挙で checkIndex を実行する。git rev-parse --show-toplevel で実行 cwd に依らない絶対 repo
// root を確定させ、git ls-files はその repo root から実行して repo-root 相対のパス形に揃える
// (サブディレクトリ起動でも repo root 起動と同一のトラック済みファイル一覧になる)。
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
  // git rev-parse は symlink 解決済みの絶対パスを返すため、index 側も realpath で揃えてから
  // repo-root 相対にする (macOS の /tmp -> /private/tmp などで相対化がずれない)。
  const indexPath = relative(repoRoot, realpathSync(resolve(process.cwd(), indexPathArg)));

  const result = checkIndex({ table, exists, trackedFiles, indexPath });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
