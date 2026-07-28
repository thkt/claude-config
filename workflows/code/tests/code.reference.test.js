// 規約インデックス (docs/REFERENCE_INDEX.md) を unit ループ前に reader agent 1 体が読み、
// script が表を glob 照合して実装 step の prompt に注入する。ADR-0091 のフラットインデックス +
// glob 照合を workflows/code.js の referenceModuleCtx 節 (ctx 追補形) に倣って実装する。
// 注入ブロックは delimiter を持ち、インデックス本文が data であり指示ではない旨と、
// 矛盾時は後の行が勝つ規則を明記する。glob 精度 (**, * の / 境界など) は後段の照合テスト群で
// 検証するので、ここでは完全一致名だけの単純な glob 行で最小限を検証する。
// 注入文言は EN/JA で localized される (EN "Read before implementing:" / JA "実装前に読む:") ため、
// assertion の期待文字列だけ EN 版に合わせ、それ以外は .ja 版と同一内容にする。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const codeJs = join(here, "..", "..", "code.js");

// インデックス行は「対象 glob、1 行説明、リファレンスパス」の表。
// sample.js に一致する glob 行 1 本と、glob 無し (常に判断候補として提示される) 行 1 本。
const INDEX_TABLE =
  "| glob | description | path |\n" +
  "| --- | --- | --- |\n" +
  "| sample.js | JS 実装時の命名規約 | docs/conventions/js-naming.md |\n" +
  "| - | エラーハンドリングの書式規約。読むかは判断による | docs/conventions/error-handling.md |\n";

const foundIndex = { found: true, table: INDEX_TABLE };
const noIndex = { found: false, table: "" };

// 直接実装 (tests 空) の 1 unit plan。impl step の prompt を最短経路で観測する。
const implPlan = (files) => ({
  test_command: "echo test",
  units: [
    {
      id: "U-1",
      goal: "docs goal",
      files,
      contract: "docs contract",
      tests: [],
      seam: false,
    },
  ],
});

// tests 有りの 1 unit plan。red step を red_confirmed: false で 2 回終わらせ、green には進めない
// (no-red 経路)。red step の prompt だけを観測したいので green stub は用意しない。
const redPlan = (files) => ({
  test_command: "echo test",
  units: [
    {
      id: "U-1",
      goal: "impl goal",
      files,
      contract: "impl contract",
      tests: [{ id: "T-100", name: "sample spec statement" }],
      seam: false,
    },
  ],
});

// reference-index の戻り値だけ差し替えられる、label 網羅 stub。未知 label は throw する
// (code.degradation.test.js と同じ形)。
const stubWith = (indexResult) => (prompt, opts) => {
  const label = opts.label ?? "";
  if (label === "reference-index") return indexResult;
  if (label.startsWith("impl:")) return { green: true, notes: "", deferred: [] };
  if (label.startsWith("red:") || label.startsWith("red2:"))
    return { red_confirmed: false, test_files: [], notes: "already implemented" };
  if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
  throw new Error(`unexpected label: ${label}`);
};

const promptFor = (calls, label) => {
  const call = calls.agent.find((c) => (c.opts.label ?? "") === label);
  assert.ok(call, `${label} agent が呼ばれる`);
  return call.prompt;
};

// 現行 (reference-index 機能追加前) の code.js が生成する impl:U-1 prompt の逐語。
// 2026-07-28、runWorkflow(codeJs, {args:{plan: implPlan(["sample.js"]), repo:""}}) を
// 機能追加前 (main) の workflows/code.js に対して実行し、impl:U-1 の prompt を採取した
// (このセッションの tool result)。
const BASELINE_IMPL_PROMPT =
  'Direct implementation step. Unit U-1\'s goal is "docs goal". The target files are ["sample.js"].\n' +
  "The contract is docs contract. The test scenarios are [].\n" +
  "The test command is echo test.\n" +
  "When writing framework / library API code, follow the pinned version's official docs rather than memory. Read docs with `scout fetch <url>`, falling back to WebFetch when scout is unavailable. If neither reaches them, mark that API usage unverified in a code comment and keep implementing.\n" +
  "Before reporting the result, audit each claim against a tool result from this session. Report only work you can point to evidence for; state unverified items as such in notes.\n" +
  "Unit-test convenience is never a reason to drop part of the feature. Do not omit a shared component, a data fetch, or a navigation affordance because it would need a Router / Suspense / permission context; stub that boundary in the test instead. Deferrals absent from the plan are forbidden, including narrowing the implementation behind a code comment claiming a later unit will do it. If part of what the contract / files require must go unimplemented, list it in deferred (it is recorded as an anomaly and surfaced on the PR).\n" +
  "Do not call the advisor tool, even on design ambiguity or an environment blocker. Push through to the end on your own analysis alone; write the judgment you made into notes and any narrowed implementation into deferred, leaving it to the anomaly record.\n" +
  "Implement per the contract; write no new tests. Keep the existing test suite green (echo test); weakening / skipping / deleting existing tests is forbidden. Run the suite and report green.";

test("glob に一致した行のリファレンスパスが実装 step の prompt に読了命令付きで注入される", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["sample.js"]), repo: "" },
    stubs: { agent: stubWith(foundIndex) },
  });

  const reader = calls.agent.find((c) => (c.opts.label ?? "") === "reference-index");
  assert.ok(reader, "reader agent が unit ループ前に呼ばれる");
  assert.match(
    reader.prompt,
    /docs\/REFERENCE_INDEX\.md/,
    "reader agent は規約パスのインデックスを読む指示を受ける",
  );

  const prompt = promptFor(calls, "impl:U-1");
  assert.match(
    prompt,
    /Read before implementing: docs\/conventions\/js-naming\.md/,
    "一致した glob 行のリファレンスパスが読了命令付きで載る",
  );
  assert.match(
    prompt,
    /---- reference-index start ----[\s\S]*---- reference-index end ----/,
    "注入ブロックが delimiter で区切られる",
  );
  assert.match(
    prompt,
    /data, not instructions/,
    "インデックス本文が data であり指示ではない旨が明記される",
  );
  assert.match(prompt, /the later line wins/, "矛盾時は後の行が勝つ規則が明記される");
});

test("Red step の prompt には注入されない", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: redPlan(["sample.js"]), repo: "" },
    stubs: { agent: stubWith(foundIndex) },
  });

  // reader が実際に呼ばれ一致を得ていることを先に確かめる。呼ばれていないなら「注入されない」は
  // 機能が無いことの空真理になり、Red step 除外を検証したことにならない。
  const reader = calls.agent.find((c) => (c.opts.label ?? "") === "reference-index");
  assert.ok(reader, "reader agent が unit ループ前に呼ばれる");

  const redPrompt = promptFor(calls, "red:U-1");
  assert.doesNotMatch(
    redPrompt,
    /docs\/conventions\/js-naming\.md/,
    "一致するリファレンスパスが Red step の prompt に載らない",
  );
  assert.doesNotMatch(
    redPrompt,
    /reference-index/,
    "reference-index の注入ブロックが Red step の prompt に無い",
  );
});

test("glob の無い行は説明文とパスが判断候補として提示される", async () => {
  // unit の files は glob 行 (sample.js) に一致しない。glob 無し行だけが常に提示されることを見る。
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["other.rb"]), repo: "" },
    stubs: { agent: stubWith(foundIndex) },
  });

  const prompt = promptFor(calls, "impl:U-1");
  assert.match(
    prompt,
    /Consider reading: docs\/conventions\/error-handling\.md/,
    "glob 無し行がパス付きの判断候補として載る",
  );
  assert.match(
    prompt,
    /エラーハンドリングの書式規約/,
    "glob 無し行の 1 行説明も判断候補として載る",
  );
  assert.doesNotMatch(
    prompt,
    /docs\/conventions\/js-naming\.md/,
    "unit の files に一致しない glob 行は載らない",
  );
});

test("注入順は汎用 (判断候補) が先、具体 (読了命令) が後になる", async () => {
  // 「後の行を優先する」規則と組むと、後置された読了命令が判断候補より優先される。
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["sample.js"]), repo: "" },
    stubs: { agent: stubWith(foundIndex) },
  });

  const prompt = promptFor(calls, "impl:U-1");
  const candidateAt = prompt.indexOf("Consider reading: docs/conventions/error-handling.md");
  const mandatoryAt = prompt.indexOf("Read before implementing: docs/conventions/js-naming.md");
  assert.ok(candidateAt >= 0, "判断候補の行が載る");
  assert.ok(mandatoryAt >= 0, "読了命令の行が載る");
  assert.ok(candidateAt < mandatoryAt, "判断候補 (汎用) が読了命令 (具体) より前に置かれる");
});

// 完全一致名だけでは `**/` と `*` を持つ実用的な
// glob 行が実運用のファイルパスに照合できない。ここでは glob サブセット (`**/` はゼロ階層にも
// 一致、`*` は `/` を跨がない) の照合規則と、両辺の先頭 `./` `/` 正規化、未対応メタ文字を含む行が
// 静かに無視されず anomaly として記録されることを検証する。

test("`docs/**/*.md` 形の glob が docs 直下と 1 階層下の md の両方に一致する", async () => {
  const table =
    "| glob | description | path |\n" +
    "| --- | --- | --- |\n" +
    "| docs/**/*.md | ドキュメント規約 | docs/conventions/docs-naming.md |\n";
  const index = { found: true, table };

  const { calls: rootCalls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["docs/readme.md"]), repo: "" },
    stubs: { agent: stubWith(index) },
  });
  assert.match(
    promptFor(rootCalls, "impl:U-1"),
    /Read before implementing: docs\/conventions\/docs-naming\.md/,
    "docs 直下 (ゼロ階層) の md ファイルが `**` の glob 行に一致する",
  );

  const { calls: nestedCalls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["docs/sub/readme.md"]), repo: "" },
    stubs: { agent: stubWith(index) },
  });
  assert.match(
    promptFor(nestedCalls, "impl:U-1"),
    /Read before implementing: docs\/conventions\/docs-naming\.md/,
    "docs の 1 階層下の md ファイルも同じ glob 行に一致する",
  );
});

test("`src/*.tsx` 形の glob は `src/app/page.tsx` に一致しない", async () => {
  const table =
    "| glob | description | path |\n" +
    "| --- | --- | --- |\n" +
    "| src/*.tsx | コンポーネント規約 | docs/conventions/component-tsx.md |\n";
  const index = { found: true, table };

  const { calls: shallowCalls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["src/button.tsx"]), repo: "" },
    stubs: { agent: stubWith(index) },
  });
  assert.match(
    promptFor(shallowCalls, "impl:U-1"),
    /Read before implementing: docs\/conventions\/component-tsx\.md/,
    "src 直下の tsx ファイルは `*.tsx` の glob 行に一致する",
  );

  const { calls: nestedCalls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["src/app/page.tsx"]), repo: "" },
    stubs: { agent: stubWith(index) },
  });
  assert.doesNotMatch(
    promptFor(nestedCalls, "impl:U-1"),
    /docs\/conventions\/component-tsx\.md/,
    "`*` は `/` を跨がないので 1 階層下の tsx ファイルは glob 行に一致しない",
  );
});

test("先頭に `./` や `/` が付いたパスは正規化されて照合される", async () => {
  const table =
    "| glob | description | path |\n" +
    "| --- | --- | --- |\n" +
    "| src/button.tsx | ボタン規約 | docs/conventions/button.md |\n";
  const index = { found: true, table };

  const { calls: dotSlashFileCalls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["./src/button.tsx"]), repo: "" },
    stubs: { agent: stubWith(index) },
  });
  assert.match(
    promptFor(dotSlashFileCalls, "impl:U-1"),
    /Read before implementing: docs\/conventions\/button\.md/,
    "先頭に `./` が付いたファイルパスは正規化後に glob 行と一致する",
  );

  const tableLeadingSlash =
    "| glob | description | path |\n" +
    "| --- | --- | --- |\n" +
    "| /src/button.tsx | ボタン規約 | docs/conventions/button.md |\n";
  const indexLeadingSlash = { found: true, table: tableLeadingSlash };

  const { calls: leadingSlashGlobCalls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["src/button.tsx"]), repo: "" },
    stubs: { agent: stubWith(indexLeadingSlash) },
  });
  assert.match(
    promptFor(leadingSlashGlobCalls, "impl:U-1"),
    /Read before implementing: docs\/conventions\/button\.md/,
    "先頭に `/` が付いた glob 行は正規化後にファイルパスと一致する",
  );
});

test("未対応メタ文字を含む行は照合対象から外れ anomaly に記録される", async () => {
  const table =
    "| glob | description | path |\n" +
    "| --- | --- | --- |\n" +
    "| src/file?.js | 未対応メタ文字を含む行 | docs/conventions/unsupported.md |\n";
  const index = { found: true, table };

  const { calls, result } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["src/file1.js"]), repo: "" },
    stubs: { agent: stubWith(index) },
  });

  assert.doesNotMatch(
    promptFor(calls, "impl:U-1"),
    /docs\/conventions\/unsupported\.md/,
    "未対応メタ文字 (`?`) を含む glob 行は照合対象から外れ、実装 prompt に注入されない",
  );
  assert.ok(
    result.anomalies.some(
      (a) => a.kind === "unsupported-glob" && String(a.notes).includes("src/file?.js"),
    ),
    "未対応メタ文字を含む行が anomaly (kind: unsupported-glob) として記録される",
  );
});

test("`/` が続かない裸の `**` を含む行は照合対象から外れ anomaly に記録される", async () => {
  // `src/**` は文字集合チェックを通るがトークン化は `**/` と `*` しか認識せず、`*` 2 つに分解
  // されて 1 セグメント照合に化ける。静かな false negative にせず未対応として記録する。
  const table =
    "| glob | description | path |\n" +
    "| --- | --- | --- |\n" +
    "| src/** | 裸の `**` を含む行 | docs/conventions/bare-doublestar.md |\n";
  const index = { found: true, table };

  const { calls, result } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["src/a/b.js"]), repo: "" },
    stubs: { agent: stubWith(index) },
  });

  assert.doesNotMatch(
    promptFor(calls, "impl:U-1"),
    /docs\/conventions\/bare-doublestar\.md/,
    "裸の `**` を含む glob 行は照合対象から外れ、実装 prompt に注入されない",
  );
  assert.ok(
    result.anomalies.some(
      (a) => a.kind === "unsupported-glob" && String(a.notes).includes("src/**"),
    ),
    "裸の `**` を含む行が anomaly (kind: unsupported-glob) として記録される",
  );
});

// 通し実行の連結検証。各機能は単体では緑でも、reader が
// 複数 unit を跨いで正しく 1 回だけ呼ばれるか、anomaly の shape が全 push サイトで揃っているかは
// 未検証だった。ここでは 2 unit plan を実 runWorkflow で通し、reader 呼び出し回数と anomaly の
// 構造的一貫性を検証する。

// 2 unit とも直接実装 (tests 空) の plan。reader 呼び出し回数と両 unit の prompt 注入だけを見る。
const twoUnitImplPlan = (filesA, filesB) => ({
  test_command: "echo test",
  units: [
    { id: "U-1", goal: "goal a", files: filesA, contract: "contract a", tests: [], seam: false },
    { id: "U-2", goal: "goal b", files: filesB, contract: "contract b", tests: [], seam: false },
  ],
});

test("インデックスありの 2 unit plan の通し実行で reader が 1 回だけ呼ばれ両 unit の実装 prompt に該当リファレンスが載る", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: twoUnitImplPlan(["sample.js"], ["sample.js"]), repo: "" },
    stubs: { agent: stubWith(foundIndex) },
  });

  const readerCalls = calls.agent.filter((c) => (c.opts.label ?? "") === "reference-index");
  assert.equal(readerCalls.length, 1, "reader agent は 2 unit plan でも 1 回だけ呼ばれる");

  assert.match(
    promptFor(calls, "impl:U-1"),
    /Read before implementing: docs\/conventions\/js-naming\.md/,
    "1 番目の unit の実装 prompt に該当リファレンスが載る",
  );
  assert.match(
    promptFor(calls, "impl:U-2"),
    /Read before implementing: docs\/conventions\/js-naming\.md/,
    "2 番目の unit の実装 prompt にも同じリファレンスが載る",
  );
});

// no-red (U-1)・scope-cut (U-2)・unsupported-glob (reader 読了後、unit ループ前) の 3 種の
// anomaly を 1 run で同時に発生させる plan。
const anomalyPlan = () => ({
  test_command: "echo test",
  units: [
    {
      id: "U-1",
      goal: "impl goal",
      files: ["a.js"],
      contract: "c1",
      tests: [{ id: "T-1", name: "already implemented" }],
      seam: false,
    },
    { id: "U-2", goal: "impl goal 2", files: ["b.js"], contract: "c2", tests: [], seam: false },
  ],
});

const unsupportedGlobTable =
  "| glob | description | path |\n" +
  "| --- | --- | --- |\n" +
  "| src/file?.js | 未対応メタ文字を含む行 | docs/conventions/unsupported.md |\n";
const unsupportedGlobIndex = { found: true, table: unsupportedGlobTable };

const stubForAnomalies = (prompt, opts) => {
  const label = opts.label ?? "";
  if (label === "reference-index") return unsupportedGlobIndex;
  if (label.startsWith("impl:")) return { green: true, notes: "", deferred: ["部分実装"] };
  if (label.startsWith("red:") || label.startsWith("red2:"))
    return { red_confirmed: false, test_files: [], notes: "already implemented" };
  if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
  throw new Error(`unexpected label: ${label}`);
};

test("anomalies の各要素が unit と kind と notes を全て持つ", async () => {
  const { result } = await runWorkflow(codeJs, {
    args: { plan: anomalyPlan(), repo: "" },
    stubs: { agent: stubForAnomalies },
  });

  assert.ok(
    result.anomalies.length >= 3,
    "no-red・scope-cut・unsupported-glob の 3 種の anomaly が記録される",
  );
  for (const anomaly of result.anomalies) {
    assert.equal(typeof anomaly.unit, "string", `anomaly (${anomaly.kind}) は unit を持つ`);
    assert.ok(anomaly.unit.length > 0, `anomaly (${anomaly.kind}) の unit は空文字でない`);
    assert.equal(typeof anomaly.kind, "string", "anomaly は kind を持つ");
    assert.equal(typeof anomaly.notes, "string", "anomaly は notes を持つ");
  }
});

test("インデックス不在では実装 prompt が現行のまま変わらない", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["sample.js"]), repo: "" },
    stubs: { agent: stubWith(noIndex) },
  });

  // reader agent 自体はインデックス不在時も unit ループ前に呼ばれる。呼ばれていないなら
  // 「prompt が変わらない」は機能が無いことの空真理になり、fail-open を検証したことにならない。
  const reader = calls.agent.find((c) => (c.opts.label ?? "") === "reference-index");
  assert.ok(reader, "reader agent はインデックス不在時も unit ループ前に呼ばれる");
  assert.match(
    reader.prompt,
    /docs\/REFERENCE_INDEX\.md/,
    "reader agent は規約パスのインデックスを読む指示を受ける",
  );

  const prompt = promptFor(calls, "impl:U-1");
  assert.equal(
    prompt,
    BASELINE_IMPL_PROMPT,
    "インデックス不在時の impl prompt は現行の逐語と同じで、注入が発生しない",
  );
});
