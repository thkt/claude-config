// classify() が返す reviewer 一覧は assert しない。ROUTING の中身を固定すると
// 表の編集ごとに落ちる change detector になるため。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const auditJs = join(here, "..", "..", "audit.js");
const reviewersDir = join(here, "..", "..", "..", "agents", "reviewers");

// Challenge 以降の stub は置かない。reviewer label に undefined を返すと findings が
// 空になり、assignments を持つ早期 return に落ちるため。
const routeOnlyStub = (files) => (prompt, opts) => {
  if (opts && opts.label === "route") {
    return { files: files.map((path) => ({ path, churn: 0 })) };
  }
  return undefined;
};

const runRoute = async (files, extra = {}) => {
  const { result, logs } = await runWorkflow(auditJs, {
    args: { skipPreflight: true, ...extra },
    stubs: { agent: routeOnlyStub(files) },
  });
  return { result, logs };
};

const unassigned = (result, files) => {
  const assigned = new Set(result.assignments.flatMap((a) => a.files));
  return files.filter((p) => !assigned.has(p));
};

// ROUTING / FOCUS の中身そのものは通常 assert しない (上のコメント参照)。だが
// T-012〜T-014 は ROUTING と FOCUS と agents/reviewers/ の 3 者の整合性を見る回
// なので、ここだけは audit.js のソースから両定数を抽出して突き合わせる。eval 系は
// 使わず、キーと配列を正規表現で読み取る。ROUTING/FOCUS の値は文字列配列か null
// のみという前提に依る。
const extractBracedBody = (source, name) => {
  const marker = `const ${name} = {`;
  const idx = source.indexOf(marker);
  if (idx === -1) return null;
  const braceStart = source.indexOf("{", idx);
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return source.slice(braceStart + 1, end - 1);
};
const parseRoutingLikeConst = (source, name) => {
  const body = extractBracedBody(source, name);
  if (body === null) return null;
  const result = {};
  const rowPattern = /(?:"([^"]+)"|(\w+))\s*:\s*(\[([^\]]*)\]|null)/g;
  let m;
  while ((m = rowPattern.exec(body))) {
    const key = m[1] || m[2];
    result[key] = m[3] === "null" ? null : [...m[4].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }
  return result;
};
// agents/reviewers/に定義はあるが ROUTING に行を持たない reviewer。skill から直接呼ばれる
// ときだけ走るので glob 表の行を持たず、audit.js の実行時にはこの区別が要らない (ROUTING に
// 無い名前は routing されないだけ)。よって期待値はここに置く。ここにも ROUTING にも名前の
// 無い定義は誰からも呼ばれないまま残るので、T-014 がそれを検知する。
const SKILL_ONLY_REVIEWERS = ["causation", "readability", "conformance"];

test("yaml と yml と json を含む diff で audit が Route 段を通過し 3 ファイルとも assignments に載る", async () => {
  const files = ["config.yaml", "ci.yml", "package.json"];

  const { result } = await runRoute(files);

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

  const { result } = await runRoute(files);

  assert.deepEqual(unassigned(result, files), [], "assignments から漏れたファイルは無い");
});

test("T-012 FOCUS のどのキーに載る reviewer 名も ROUTING のいずれかの行に存在する", () => {
  const source = readFileSync(auditJs, "utf8");
  const routing = parseRoutingLikeConst(source, "ROUTING");
  const focus = parseRoutingLikeConst(source, "FOCUS");
  assert.ok(routing, "audit.js から ROUTING を抽出できる");
  assert.ok(focus, "audit.js から FOCUS を抽出できる");

  const routedReviewers = new Set(Object.values(routing).flat());
  const missing = [];
  for (const [key, reviewers] of Object.entries(focus)) {
    if (!Array.isArray(reviewers)) continue; // all: null はスキップ
    for (const r of reviewers) {
      if (!routedReviewers.has(r)) missing.push(`${key}:${r}`);
    }
  }
  assert.deepEqual(missing, [], `ROUTING のどの行にも無い FOCUS reviewer: ${missing.join(", ")}`);
});

test("T-013 ROUTING に載る reviewer 名は agents/reviewers/に定義ファイルを持つ", () => {
  const source = readFileSync(auditJs, "utf8");
  const routing = parseRoutingLikeConst(source, "ROUTING");
  assert.ok(routing, "audit.js から ROUTING を抽出できる");

  const routedReviewers = [...new Set(Object.values(routing).flat())];
  const definedFiles = new Set(readdirSync(reviewersDir));
  const missing = routedReviewers.filter((r) => !definedFiles.has(`reviewer-${r}.md`));
  assert.deepEqual(
    missing,
    [],
    `agents/reviewers/に定義ファイルの無い ROUTING reviewer: ${missing.join(", ")}`,
  );
});

test("T-014 agents/reviewers/の定義は ROUTING か skill-only allowlist のどちらかに載る", () => {
  const source = readFileSync(auditJs, "utf8");
  const routing = parseRoutingLikeConst(source, "ROUTING");
  assert.ok(routing, "audit.js から ROUTING を抽出できる");

  const routedReviewers = new Set(Object.values(routing).flat());
  const skillOnly = new Set(SKILL_ONLY_REVIEWERS);
  const definedNames = readdirSync(reviewersDir)
    .filter((f) => f.startsWith("reviewer-") && f.endsWith(".md"))
    .map((f) => f.slice("reviewer-".length, -".md".length));

  const orphaned = definedNames.filter((n) => !routedReviewers.has(n) && !skillOnly.has(n));
  assert.deepEqual(
    orphaned,
    [],
    `ROUTING にも skill-only allowlist にも載らない agents/reviewers/定義: ${orphaned.join(", ")}`,
  );

  // 両方に載る名前は ROUTING 側で発火するので、skill-only に置いた意図が消える。
  const both = [...routedReviewers].filter((n) => skillOnly.has(n));
  assert.deepEqual(
    both,
    [],
    `ROUTING と skill-only allowlist の両方に載る reviewer: ${both.join(", ")}`,
  );
});

test("T-015 focus 指定で 0 reviewer になったファイルが件数とパスつきで返り値に載る", async () => {
  // *.js は ROUTING["*.js"] に accessibility / progressive を含まないため、
  // focus: "a11y" (FOCUS.a11y = ["accessibility", "progressive"]) と交差させると
  // このファイルは reviewer 0 件になる。
  const files = ["src/sample.js"];

  const { result, logs } = await runRoute(files, { focus: "a11y" });

  assert.ok(
    Array.isArray(result.zero_reviewer_files),
    "0 reviewer になったファイルの配列を返り値に持つ",
  );
  assert.deepEqual(
    result.zero_reviewer_files.map((f) => f.path),
    files,
    "0 reviewer になったファイルのパスが返り値に載る",
  );
  assert.ok(
    logs.some((l) => /zero.?reviewer/i.test(l) && l.includes(String(files.length))),
    "0 reviewer になった件数が log() に出る",
  );
});
