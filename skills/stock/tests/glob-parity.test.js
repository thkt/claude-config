// U-004: skills/stock/scripts/check-index.mjs の glob 判定 (checkIndex) と
// workflows/code.js の reference-index 節の glob 判定は、check-index.mjs の先頭コメント
// ("The glob rule follows the same rule as workflows/code.js's reference-index section")
// が宣言する通り、同じ規則を 2 箇所に複製したものである。複製は改修時にずれ得るので、
// 共通 fixture 表 (glob, path の組) を両者に同じ入力として与え、判定結果が常に一致することを
// このテストで見張る。
//
// script 側は checkIndex({table, exists, trackedFiles}) を直接呼ぶ。code.js 側は
// workflows/_lib/run-workflow.js の runWorkflow で code.js を実行し、reference-index reader
// agent の戻り値に fixture の table を注入した上で、1 unit (files: [path]) の実装 step の
// prompt に "Read before implementing: <path>" が現れるかどうかを、code.js 側の注入有無の
// 判定として採取する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../../workflows/_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const scriptPath = join(root, "skills", "stock", "scripts", "check-index.mjs");
const codeJs = join(root, "workflows", "code.js");

// リファレンス先パスは判定結果を運ぶだけなので、全行で固定の 1 パスにする。
const REF_PATH = "docs/ref.md";

// 共通 fixture 表。各行は 1 つの glob と、それに対して判定したい 1 つのファイルパスの組。
// exists 種別: 完全一致 / `**/` のゼロ階層・1 階層一致 / `*` が `/` を跨がない境界 /
// 先頭 `./` `/` の正規化 / 未対応メタ文字 (`?`) / 裸の `**` / 拡張子不一致の no-match。
const FIXTURE = [
  { glob: "sample.js", path: "sample.js" },
  { glob: "sample.js", path: "other.js" },
  { glob: "docs/**/*.md", path: "docs/readme.md" },
  { glob: "docs/**/*.md", path: "docs/sub/readme.md" },
  { glob: "src/*.tsx", path: "src/button.tsx" },
  { glob: "src/*.tsx", path: "src/app/page.tsx" },
  { glob: "src/button.tsx", path: "./src/button.tsx" },
  { glob: "/src/button.tsx", path: "src/button.tsx" },
  { glob: "src/file?.js", path: "src/file1.js" },
  { glob: "src/**", path: "src/a/b.js" },
  { glob: "src/*.foo", path: "src/button.tsx" },
];

// script 側の判定。unsupported 行は driftTargets (dangling/noMatch の母集団) から除外される
// ので、unsupported に載る行は「一致しない」として扱う (code.js 側も未対応行は注入しない)。
async function scriptMatches(glob, path) {
  const { checkIndex } = await import(scriptPath);
  const table = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    `| ${glob} | fixture row | ${REF_PATH} |`,
  ].join("\n");
  const result = checkIndex({ table, exists: () => true, trackedFiles: [path] });
  if (result.unsupported.length > 0) return false;
  return result.noMatch.length === 0;
}

// code.js 側の判定。1 unit (tests 空、直接実装 step) の files に path を積み、reference-index
// reader agent の戻り値に fixture の table を注入して、impl step の prompt に読了命令が
// 載るかどうかを見る。
async function codeMatches(glob, path) {
  const table = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    `| ${glob} | fixture row | ${REF_PATH} |`,
  ].join("\n");
  const plan = {
    test_command: "echo test",
    units: [
      {
        id: "U-1",
        goal: "fixture goal",
        files: [path],
        contract: "fixture contract",
        tests: [],
        seam: false,
      },
    ],
  };
  const stub = (prompt, opts) => {
    const label = opts.label ?? "";
    if (label === "reference-index") return { found: true, table };
    if (label.startsWith("impl:")) return { green: true, notes: "", deferred: [] };
    if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
    throw new Error(`unexpected label: ${label}`);
  };
  const { calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "" },
    stubs: { agent: stub },
  });
  const impl = calls.agent.find((c) => (c.opts.label ?? "") === "impl:U-1");
  assert.ok(impl, "impl:U-1 agent が呼ばれる");
  return new RegExp(`Read before implementing: ${REF_PATH.replace(/\./g, "\\.")}`).test(
    impl.prompt,
  );
}

test("共通 fixture 表の全 (glob, path) 組で code.js の注入有無と script の一致判定が同じ結果になる", async () => {
  const mismatches = [];
  for (const { glob, path } of FIXTURE) {
    const [fromScript, fromCode] = await Promise.all([
      scriptMatches(glob, path),
      codeMatches(glob, path),
    ]);
    if (fromScript !== fromCode) {
      mismatches.push({ glob, path, fromScript, fromCode });
    }
  }
  assert.deepEqual(
    mismatches,
    [],
    `script と code.js の判定が食い違う行がある: ${JSON.stringify(mismatches)}`,
  );
});
