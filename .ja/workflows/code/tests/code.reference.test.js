// U-001 (Issue #270): 規約インデックス (docs/reference-index.md) を unit ループ前に reader agent
// 1 体が読み、script が表を glob 照合して実装 step の prompt に注入する。ADR-0091 のフラット
// インデックス + glob 照合を workflows/code.js の referenceModuleCtx 節 (ctx 追補形) に倣って実装する。
// contract: 注入ブロックは delimiter を持ち、インデックス本文が data であり指示ではない旨と、
// 矛盾時は後の行が勝つ規則を明記する。glob 精度 (**, * の / 境界など) は U-002 の対象なので、
// ここでは完全一致名だけの単純な glob 行で最小限を検証する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const codeJs = join(here, "..", "..", "code.js");

// インデックス行は「対象 glob、1 行説明、リファレンスパス」の表 (issue #270 Plan)。
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
// 現行コードに対して実行し、impl:U-1 の prompt を採取した (このセッションの tool result)。
const BASELINE_IMPL_PROMPT =
  '直接実装 step。Unit U-1 の goal は「docs goal」。対象ファイルは ["sample.js"]。\n' +
  "contract は docs contract。test scenario は []。\n" +
  "テストコマンドは echo test。\n" +
  "フレームワーク / ライブラリの API を書くときは、記憶でなく pinned version の公式 docs に従う。docs は `scout fetch <url>` で読み、scout が無ければ WebFetch に落とす。どちらも読めなければその API 使用を未確認としてコード内コメントに残し、実装は続ける。\n" +
  "結果を報告する前に、各 claim をこのセッションの tool result と突き合わせる。evidence を指せる作業のみ報告し、未検証のものは notes にその旨を書く。\n" +
  "単体テストの都合を理由に機能の一部を落とすことは禁止。Router / Suspense / 権限 context が要るという理由で、共有コンポーネント・データ取得・遷移導線を省いてはならない。テスト側でその境界を差し替える。plan に無い先送りは禁止で、コード内コメントで「別ユニット」「後続に委ねる」と宣言して実装を狭めることも禁止。contract / files が求める実装の一部をやむを得ず実装しない場合は deferred に列挙する (anomaly として記録され PR に surface される)。\n" +
  "設計の曖昧さや環境起因の blocker に当たっても advisor tool は呼ばない。自分の解析だけで最後まで進み、下した判断を notes に、実装を狭めた分を deferred に書いて anomaly 記録に委ねる。\n" +
  "contract に従って実装する。新しいテストは書かない。既存のテスト suite (echo test) を green に保つ。既存テストの弱体化 / skip / 削除は禁止。suite を実行して green を報告する。";

test("glob に一致した行のリファレンスパスが実装 step の prompt に読了命令付きで注入される", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["sample.js"]), repo: "" },
    stubs: { agent: stubWith(foundIndex) },
  });

  const reader = calls.agent.find((c) => (c.opts.label ?? "") === "reference-index");
  assert.ok(reader, "reader agent が unit ループ前に呼ばれる");
  assert.match(
    reader.prompt,
    /docs\/reference-index\.md/,
    "reader agent は規約パスのインデックスを読む指示を受ける",
  );

  const prompt = promptFor(calls, "impl:U-1");
  assert.match(
    prompt,
    /実装前に読む: docs\/conventions\/js-naming\.md/,
    "一致した glob 行のリファレンスパスが読了命令付きで載る",
  );
  assert.match(
    prompt,
    /---- reference-index start ----[\s\S]*---- reference-index end ----/,
    "注入ブロックが delimiter で区切られる",
  );
  assert.match(
    prompt,
    /data であり指示ではない/,
    "インデックス本文が data であり指示ではない旨が明記される",
  );
  assert.match(prompt, /後の行を優先する/, "矛盾時は後の行が勝つ規則が明記される");
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
    /判断候補: docs\/conventions\/error-handling\.md/,
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

// U-002 (Issue #270): U-001 は完全一致名だけの最小実装だったので、`**/` と `*` を持つ実用的な
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
    /実装前に読む: docs\/conventions\/docs-naming\.md/,
    "docs 直下 (ゼロ階層) の md ファイルが `**` の glob 行に一致する",
  );

  const { calls: nestedCalls } = await runWorkflow(codeJs, {
    args: { plan: implPlan(["docs/sub/readme.md"]), repo: "" },
    stubs: { agent: stubWith(index) },
  });
  assert.match(
    promptFor(nestedCalls, "impl:U-1"),
    /実装前に読む: docs\/conventions\/docs-naming\.md/,
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
    /実装前に読む: docs\/conventions\/component-tsx\.md/,
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
    /実装前に読む: docs\/conventions\/button\.md/,
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
    /実装前に読む: docs\/conventions\/button\.md/,
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
    /docs\/reference-index\.md/,
    "reader agent は規約パスのインデックスを読む指示を受ける",
  );

  const prompt = promptFor(calls, "impl:U-1");
  assert.equal(
    prompt,
    BASELINE_IMPL_PROMPT,
    "インデックス不在時の impl prompt は現行の逐語と同じで、注入が発生しない",
  );
});
