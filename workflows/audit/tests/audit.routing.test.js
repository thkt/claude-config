// classify() が返す reviewer 一覧は assert しない。ROUTING の中身を固定すると
// 表の編集ごとに落ちる change detector になるため。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const auditJs = join(here, "..", "..", "audit.js");

// Challenge 以降の stub は置かない。reviewer label に undefined を返すと findings が
// 空になり、assignments を持つ早期 return に落ちるため。
const routeOnlyStub = (files) => (prompt, opts) => {
  if (opts && opts.label === "route") {
    return { files: files.map((path) => ({ path, churn: 0 })) };
  }
  return undefined;
};

const runRoute = async (files) => {
  const { result } = await runWorkflow(auditJs, {
    args: { skipPreflight: true },
    stubs: { agent: routeOnlyStub(files) },
  });
  return result;
};

const unassigned = (result, files) => {
  const assigned = new Set(result.assignments.flatMap((a) => a.files));
  return files.filter((p) => !assigned.has(p));
};

test("yaml と yml と json を含む diff で audit が Route 段を通過し 3 ファイルとも assignments に載る", async () => {
  const files = ["config.yaml", "ci.yml", "package.json"];

  const result = await runRoute(files);

  assert.deepEqual(unassigned(result, files), [], "assignments から漏れたファイルは無い");
});

test("classify がソース上で分岐する全拡張子について、そのファイルが assignments のいずれかに載る", async () => {
  // 拡張子はテスト側に列挙しない。classify に分岐が増えたとき追随できないため。
  // `[".yaml", ".yml"].includes(e)` のような形で分岐を足すとこの抽出からは漏れる。
  const source = readFileSync(auditJs, "utf8");
  const extensions = [...source.matchAll(/\be === "(\.[a-z0-9]+)"/g)].map((m) => m[1]);
  assert.notEqual(extensions.length, 0, "audit.js から拡張子の分岐を抽出できる");

  // `.yaml` のような先頭ドットだけのパスは使わない。ext() が "" を返し、分岐を
  // 通らないまま ROUTING.default に落ちるため。stem に test を含めないのは
  // classify 先頭の test 判定に吸われるため。
  const files = extensions.map((e, i) => `src/sample-${i}${e}`);

  const result = await runRoute(files);

  assert.deepEqual(unassigned(result, files), [], "assignments から漏れたファイルは無い");
});
