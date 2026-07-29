// docs/REFERENCE_INDEX.md の各行を検証する。glob 判定は workflows/code.js の reference-index
// 節と同じ規則を複製したもので、ずれは glob-parity.test.js が見張る。
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

// glob 行・trackedFiles のどちらが接頭辞を持っていても揃うように、先頭の `./` `/` を剥がす。
const normalizeMatchPath = (p) => String(p).replace(/^(?:\.\/|\/)+/, "");

// 裸の `**` (`/` を伴わない) はトークン化すると `*` 2 個に分解され単一階層一致に劣化するので、
// 文字集合は通っても未対応として除外する。
const SUPPORTED_GLOB_CHARS = /^[\w.\-/*]*$/;
const BARE_DOUBLE_STAR = /\*\*(?!\/)/;

// 「1 画面」の行数を、use-context-reviewer-readability スキルが既に定義する関数行数の
// 閾値 (≤30、根拠: 1 画面の可読性) から流用する (ADR-0091)。
const SIZE_THRESHOLD_LINES = 30;

const unwrapCode = (cell) => cell.replace(/^`(.*)`$/, "$1").trim();

// 実装 agent に読ませる規約でない docs は候補から外す。決定記録 (DR) は過去の判断の
// 経緯を残すもので、実装時に読ませると 1 画面の閾値を即座に食い潰す。index (README) と
// 作業中の候補置き場も規約ではない。
const EXCLUDED_FROM_CANDIDATES = [/^docs\/decisions\//, /(^|\/)README\.md$/, /(^|\/)_[^/]*\.md$/];

// index の不在は異常ではなく、これから索引化する初期状態。空表として扱い、候補提案の入力
// (unreferenced) だけ埋めたレポートを返す。found でその区別を呼び出し元へ伝える。
export function checkIndex({ table, exists, trackedFiles, indexPath, found = true }) {
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
    // glob 列の backtick を剥がす。markdown formatter は裸の `*` を強調記号と解釈して
    // エスケープするので、index 側は inline code で囲んで自衛する。
    .map(([glob, description, path]) => ({ glob: unwrapCode(glob), description, path }));

  // `-` 行は glob を持たないため、drift 判定にかけると常に no-match になる。未対応行は
  // 誤判定を招くので同じく drift から外し、unsupported として別掲する。
  const isUnsupportedGlob = (glob) =>
    !SUPPORTED_GLOB_CHARS.test(glob) || BARE_DOUBLE_STAR.test(glob);
  const unsupported = rows.filter((row) => row.glob !== "-" && isUnsupportedGlob(row.glob));
  const driftTargets = rows.filter((row) => row.glob !== "-" && !isUnsupportedGlob(row.glob));

  const dangling = driftTargets.filter((row) => !exists(row.path));

  const noMatch = driftTargets.filter((row) => {
    const matcher = globToRegExp(normalizeMatchPath(row.glob));
    return !trackedFiles.some((file) => matcher.test(normalizeMatchPath(file)));
  });

  // path 列は `-` 行も含め全行が実パスを持つので、参照済み判定は全行の path 集合と比較する。
  // index ファイル自身は自分の path 列に載れないため、除外しないと恒久的に unreferenced に残る。
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

// git rev-parse --show-toplevel で実行 cwd に依らない絶対 repo root を確定させ、git ls-files
// はその repo root から実行する。サブディレクトリ起動でも repo root 起動と同じ一覧になる。
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
  // git rev-parse は symlink 解決済みの絶対パスを返すため、index 側も realpath で揃えてから
  // repo-root 相対にする (macOS の /tmp -> /private/tmp などで相対化がずれない)。
  const indexPath = found ? relative(repoRoot, realpathSync(absoluteIndexPath)) : indexPathArg;

  const result = checkIndex({ table, exists, trackedFiles, indexPath, found });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.exitCode;
}

const INDEX_HEADER = ["| glob | description | path |", "| --- | --- | --- |"];

// 採用行を index へ追記する。ヘッダーは 2 行ちょうどでないと、先頭 2 行を無条件に読み飛ばす
// パーサと噛み合わず、データ行を 1 つ食うか区切り行を幽霊行として拾う (references/
// reference-index-format.md § 表の制約)。手書きさせず、ここで決定論的に出す。
export function appendRows(existingTable, rows) {
  const existingRows = existingTable
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  // glob は inline code で囲んで書く。裸で置くと markdown formatter が `*` を強調記号と
  // 解釈してエスケープし、全行が対応外 glob に化ける。
  const added = rows.map(
    (row) => `| \`${unwrapCode(row.glob)}\` | ${row.description} | ${row.path} |`,
  );
  return [...(existingRows.length ? existingRows : INDEX_HEADER), ...added].join("\n") + "\n";
}

// 追記モード。採用行を {glob, description, path} の JSON 配列で受け、index へ書き戻す。
// 採否は呼び出し元 (人間の判断) が済ませた前提で、ここは書き込みだけ担う。
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
