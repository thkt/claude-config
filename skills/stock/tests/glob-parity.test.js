// check-index.js と workflows/code.js は同じ glob 規則を 2 箇所に複製して持つ。複製は改修時に
// ずれ得るので、共通 fixture 表を両者へ同じ入力として与え、判定結果の一致を見張る。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../../workflows/_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const scriptPath = join(root, "skills", "stock", "scripts", "check-index.js");
const codeJs = join(root, "workflows", "code.js");

// リファレンス先パスは判定に効かないので固定する。
const REF_PATH = "docs/ref.md";

// 完全一致、`**/` のゼロ階層と 1 階層、`*` が `/` を跨がない境界、先頭 `./` `/` の正規化、
// 未対応メタ文字、裸の `**`、拡張子不一致を並べる。
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

// unsupported 行は noMatch の母集団から外れるため、noMatch が空でも一致とは限らない。
// code.js 側も未対応行は注入しないので、ここでは「一致しない」に寄せる。
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

// code.js に判定用の API は無いので、reader agent の戻り値に table を注入し、impl step の
// prompt に読了命令が載るかどうかを一致判定として採る。
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
