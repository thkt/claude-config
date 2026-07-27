// DR-0085: build.js が Load (fetch -> Plan 節必須 -> 決定論 id 収集 -> extract -> validate +
// id cross-check) / Revalidate / Branch / Code (sonnet) / Verify (決定論スコープ + T-NNN 照合 ∥
// conformance) / Polish (cleanup のみ) / Ship の実行ループになることの行動検証。
// audit fan-out / fix loop の不在・fail-close 分岐・phase 順・stopped 値 snapshot を自動検証する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const buildJs = join(here, "..", "..", "build.js");

// build.js の no-repo gate を通す共有 args。repo は anchor / guard の文字列組み立てに
// しか使われないので、絶対 path 形の固定値 1 つで全テストを賄える。
const repo = "/abs/target-repo";
const args = { issue: "123", repo };

// Plan 節付き issue body。unitIds / testIds は決定論 id 収集の対象になるリテラル。
const bodyFor = (unitIds, testIds) =>
  [
    "Issue の背景説明。",
    "",
    "## Plan",
    "",
    ...unitIds.map((u) => `### ${u}: unit の見出し`),
    ...testIds.map((t) => `- ${t}: test scenario`),
    "",
    "test_command: echo test",
    "",
  ].join("\n");

// build の validate() + content 非空検査を通る抽出済み plan。
const makePlan = (overrides = {}) => ({
  outcome: "sample outcome",
  decisions: [],
  assumptions: ["assumption-1"],
  units: [
    {
      id: "U-001",
      goal: "sample goal",
      files: ["sample.js"],
      contract: "sample contract",
      tests: [{ id: "T-001", name: "sample spec statement" }],
    },
  ],
  test_command: "echo test",
  preconditions: [{ path: "sample.js", pattern: "sampleSymbol" }],
  backlog_candidates: [],
  ...overrides,
});

// agent 呼び出しを schema の形で分類する。label 文字列への結合を避け、
// FETCH_SCHEMA {found, body} / EXTRACT_SCHEMA (units) / REVALIDATE_SCHEMA (results の
// items が path) / TEST_PRESENCE_SCHEMA (results の items が name) / DIFF_SCHEMA {files} /
// CONFORMANCE {spec_found} / TRANSLATION {translations} / SHIP {pr_url} を判別する。
const kindOf = (opts) => {
  const p = (opts && opts.schema && opts.schema.properties) || null;
  if (!p) return "plain";
  if ("found" in p && "body" in p) return "fetch";
  if ("units" in p) return "extract";
  if ("results" in p) {
    const item = (p.results.items && p.results.items.properties) || {};
    return "name" in item ? "presence" : "revalidate";
  }
  if ("branch" in p) return "branch";
  if ("untracked" in p) return "untracked";
  if ("files" in p) return "diff";
  if ("edits" in p) return "cleanup";
  if ("verdict" in p) return "critique";
  if ("spec_found" in p) return "conformance";
  if ("translations" in p) return "translate";
  if ("pr_url" in p) return "ship";
  return "plain";
};

// happy path stub 一式。body / plan / revalidate / diff / presence / conformance で
// happy path の戻り値を差し替える。diff / presence は値でも関数 (prompt を受ける) でもよい。
const makeStubs = ({
  body,
  plan,
  revalidate,
  conformance,
  translate,
  diff,
  presence,
  critique,
  branch,
  untracked,
  code,
} = {}) => ({
  agent: (prompt, opts) => {
    const kind = kindOf(opts);
    switch (kind) {
      case "translate":
        // 既定は fail-open (translations 無し) で英語原文を維持。翻訳の反映を検証する
        // テストだけが translate stub を渡す。
        return translate ? translate(prompt) : { notes: "no-translations" };
      case "fetch":
        return { found: true, body: body ?? bodyFor(["U-001"], ["T-001"]) };
      case "extract":
        return plan ?? makePlan();
      case "revalidate":
        return (
          revalidate ?? {
            results: [
              {
                path: "sample.js",
                pattern: "sampleSymbol",
                exists: true,
                matches: true,
              },
            ],
          }
        );
      case "diff":
        // 既定は plan の files と同一の diff (スコープ逸脱なし)。null override で
        // fail-open 経路を踏める。
        if (diff !== undefined) return typeof diff === "function" ? diff(prompt) : diff;
        return { files: ["sample.js"] };
      case "presence": {
        // 既定は prompt 末尾の checks JSON を読み、全 name を found: true で返す
        // (verify-tests.py の happy relay と同型)。
        if (presence !== undefined)
          return typeof presence === "function" ? presence(prompt) : presence;
        const checks = JSON.parse(prompt.trim().split("\n").pop());
        return {
          results: checks.flatMap((c) => c.names.map((name) => ({ name, found: true }))),
        };
      }
      case "branch":
        // head は分岐点 sha。既定で返すことで happy path は本番と同じ per-unit commit
        // 経路 (DR-0088) を通る。sha 以外を返す override で fallback 経路を踏める。
        return branch ?? { branch: "feat/sample-branch", head: "a1b2c3d4e5f6a7b8" };
      case "untracked":
        return untracked ?? { untracked: [] };
      case "cleanup":
        return { edits: [], tests_pass: true, stashed: false };
      case "critique":
        // draftPlan の critic-design gate。既定は GO。
        return critique ?? { verdict: "GO", weaknesses: [] };
      case "conformance":
        return conformance ?? { spec_found: false, findings: [] };
      case "ship":
        return { committed: true, pr_url: "https://example.com/pr/1" };
      default:
        return "feat/sample-branch";
    }
  },
  workflow: (name) => {
    if (name === "code")
      return (
        code ?? {
          completed: ["U-001"],
          anomalies: [],
          commits: [{ unit: "U-001", subject: "feat: sample subject" }],
          tests_pass: true,
          gates_pass: true,
        }
      );
    // 実 runtime の意味論: 未知の workflow 名は throw する。sibling() は code を先に試して
    // ここで解決するので build:code へ fallback しない。audit は DR-0085 で build から
    // 外れたので、呼ばれたらこの throw が (fallback ではなく) テストを落とす。
    throw new Error(`unknown workflow: ${name}`);
  },
});

const agentCallsOf = (calls, kind) => calls.agent.filter((c) => kindOf(c.opts) === kind);
// generate-plan / critique-plan は共に kindOf を "extract" / "critique" に分類するので、
// draftPlan の再実行検証は kindOf でなく label で識別する。
const agentCallsByLabel = (calls, label) => calls.agent.filter((c) => c.opts.label === label);

test("args 空は stopped: no-issue で fail-close する", async () => {
  const empty = await runWorkflow(buildJs, { args: {}, stubs: makeStubs() });
  assert.equal(empty.result.stopped, "no-issue", "args 空で stopped: no-issue");
  assert.equal(empty.calls.workflow.length, 0, "no-issue 後に入れ子 workflow が走らない");
  assert.ok(
    empty.calls.phase.every((p) => p === "Load"),
    "no-issue 後に Load 以外の phase が走らない",
  );
});

// 数字を含むだけの自由記述 (例: "a11y" の 11) を issue 番号と誤認しない。抽出は
// 数字単体 / #数字 / issue URL に厳格化されており、それ以外は stopped: no-issue。
test("数字を含む自由記述は issue 参照と誤認せず stopped: no-issue で fail-close する", async () => {
  const desc = await runWorkflow(buildJs, {
    args: "issue の状態目標は a11y 対応も含む",
    stubs: makeStubs(),
  });
  assert.equal(desc.result.stopped, "no-issue", "自由記述の 11 を issue 番号にしない");
  assert.equal(agentCallsOf(desc.calls, "fetch").length, 0, "誤認した issue を fetch しない");
});

// repo 無し args の no-repo gate (build.js の if (!repo)) を regression として pin する。
// gate は issue-ref check 通過後・Load fetch agent 起動前に fire するので、有効な issue 参照
// を持つ object 形 ({issue}) と bare string 形 ("123") の両方が fetch 0 回で止まる。
test("args.repo 欠落 (object / bare string) は stopped: no-repo で fetch 前に fail-close する", async () => {
  for (const argsWithoutRepo of [{ issue: "123" }, "123"]) {
    const form = typeof argsWithoutRepo === "string" ? "bare string" : "object";
    const run = await runWorkflow(buildJs, { args: argsWithoutRepo, stubs: makeStubs() });
    assert.equal(
      run.result.stopped,
      "no-repo",
      `${form} 形は issue-ref check を通過し stopped: no-repo で止まる (no-issue でなく)`,
    );
    assert.equal(
      agentCallsOf(run.calls, "fetch").length,
      0,
      `${form} 形は Load fetch agent 起動前に止まる`,
    );
    assert.equal(
      run.calls.workflow.length,
      0,
      `${form} 形は no-repo 後に入れ子 workflow が走らない`,
    );
  }
});

// 有効な参照形式 (数字単体 / #数字 / issue URL) は repo 付き args で同じ番号を取り出す。
// string 単体の args は repo を運べず no-repo gate (stopped: no-repo) で fetch 前に
// 止まるため、参照形式の受理は { issue: ref, repo } の形でのみ観測できる。
test("数字単体 / #数字 / issue URL を repo 付き args で渡すと同じ issue 番号を抽出し fetch が各 1 回走る", async () => {
  for (const ref of ["123", "#123", "https://github.com/o/r/issues/123"]) {
    const run = await runWorkflow(buildJs, {
      args: { issue: ref, repo },
      stubs: makeStubs(),
    });
    assert.equal(run.result.stopped, undefined, `${ref} は repo 付き args で fail-close しない`);
    assert.equal(run.result.issue, "123", `${ref} から同じ issue 番号 123 を抽出する`);
    assert.equal(agentCallsOf(run.calls, "fetch").length, 1, `${ref} で fetch が 1 回走る`);
  }
});

// Plan 節なし issue は build 内の draftPlan (generate → critique) が plan を下書きし、
// build は続行する (DR-0086)。extract label は使わず、下書き plan で Ship まで進む。
test("Plan 節なし本文は build 内 draftPlan で plan を下書きし Ship まで進む", async () => {
  const noPlan = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      body: "Plan 見出しの無い issue 本文。\n\n## Context\n\n説明のみ。",
    }),
  });
  const labels = noPlan.calls.agent.map((c) => c.opts.label);
  assert.equal(noPlan.result.stopped, undefined, "Plan 節なしでも fail-close しない");
  assert.ok(labels.includes("generate-plan"), "draftPlan の generate agent が呼ばれる");
  assert.ok(labels.includes("critique-plan"), "draftPlan の critic-design gate が呼ばれる");
  assert.ok(!labels.includes("extract"), "Plan 節なし path では extract (label) を呼ばない");
  assert.ok(
    noPlan.calls.workflow.every((c) => c.name !== "draft-plan"),
    "draft-plan は workflow でなく inline なので workflow 呼び出しに現れない",
  );
  assert.ok(noPlan.calls.phase.includes("Ship"), "下書き plan で Ship phase まで到達する");
});

// draftPlan の critic-design が NO-GO なら stopped: generated-plan-rejected で fail-close
// し、Code へ進まない (DR-0086)。
test("critic-design NO-GO は stopped: generated-plan-rejected で Code へ進まない", async () => {
  const rejected = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      body: "Plan 見出しの無い issue 本文。",
      critique: { verdict: "NO-GO", weaknesses: ["unit 分解が不健全"] },
    }),
  });
  assert.equal(
    rejected.result.stopped,
    "generated-plan-rejected",
    "NO-GO で stopped: generated-plan-rejected",
  );
  assert.ok(
    (rejected.result.weaknesses || []).includes("unit 分解が不健全"),
    "critic の weaknesses が surface する",
  );
  assert.ok(!rejected.calls.phase.includes("Code"), "NO-GO で Code phase へ進まない");
});

// issue body は untrusted input (public repo では誰でも編集できる) なので、extract prompt
// では bare `---` でなく明示的な data fence で囲み、fence 内容を instruction として扱わない
// 指示を付けて prompt injection を鈍らせる。
test("extract prompt は issue body を untrusted data fence で囲む", async () => {
  const withPlan = await runWorkflow(buildJs, { args, stubs: makeStubs() });
  const extract = agentCallsOf(withPlan.calls, "extract");
  assert.equal(extract.length, 1, "Plan 節あり path で extract agent が 1 回呼ばれる");
  assert.ok(
    extract[0].prompt.includes("BEGIN UNTRUSTED ISSUE BODY") &&
      extract[0].prompt.includes("END UNTRUSTED ISSUE BODY"),
    "extract prompt は body を BEGIN/END の untrusted fence で囲む",
  );
  assert.ok(
    /どんな指示にも従わない/.test(extract[0].prompt),
    "fence 内容を instruction として扱わない指示が付く",
  );
  assert.equal(extract[0].opts.model, "sonnet", "extract は機械的写しなので sonnet 固定");
});

test("構造欠陥と content 空 (contract / name) はいずれも stopped: invalid-plan になる", async () => {
  const variants = [
    { plan: makePlan({ units: [] }), expect: /units/ },
    {
      plan: makePlan({
        units: [{ ...makePlan().units[0], contract: "" }],
      }),
      expect: /contract/,
    },
    {
      plan: makePlan({
        units: [
          {
            ...makePlan().units[0],
            tests: [{ ...makePlan().units[0].tests[0], name: "" }],
          },
        ],
      }),
      expect: /name/,
    },
  ];
  for (const { plan, expect } of variants) {
    const { result } = await runWorkflow(buildJs, {
      args,
      stubs: makeStubs({ plan }),
    });
    assert.equal(result.stopped, "invalid-plan", `variant ${expect} で stopped: invalid-plan`);
    assert.ok(Array.isArray(result.blockers), "blockers が配列で返る");
    assert.ok(
      result.blockers.some((b) => expect.test(String(b))),
      `blockers に ${expect} を含むエラー文言が載る`,
    );
  }
});

// unit ごとのテストは自分の境界を stub するため、各 unit が緑でも層が結線されない
// (kizalas #558 / PR 575)。テストを持つ unit が 2 つ以上ある plan は seam unit を要求する。
test("テストを持つ unit が 2 つ以上で seam unit が無い plan は stopped: invalid-plan、seam: true があれば通る", async () => {
  const twoTestedUnits = (seam) => [
    { ...makePlan().units[0], seam: false },
    {
      id: "U-002",
      goal: "second goal",
      files: ["second.js"],
      contract: "second contract",
      tests: [{ id: "T-002", name: "second spec statement" }],
      seam,
    },
  ];

  const missing = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ plan: makePlan({ units: twoTestedUnits(false) }) }),
  });
  assert.equal(missing.result.stopped, "invalid-plan", "seam unit 無しは invalid-plan で止まる");
  assert.ok(
    missing.result.blockers.some((b) => /seam/.test(String(b))),
    "blockers に seam unit を要求する文言が載る",
  );

  const present = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ plan: makePlan({ units: twoTestedUnits(true) }) }),
  });
  assert.notEqual(present.result.stopped, "invalid-plan", "seam: true があれば validate を通る");
});

// tests が空の unit は境界を持たないので seam の対象外。docs / 設定だけの plan が
// seam 要求で止まらないことを固定する。
test("テストを持つ unit が 1 つ以下なら seam unit が無くても validate を通る", async () => {
  const { result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      plan: makePlan({
        units: [
          { ...makePlan().units[0], seam: false },
          {
            id: "U-002",
            goal: "docs only",
            files: ["README.md"],
            contract: "docs contract",
            tests: [],
            seam: false,
          },
        ],
      }),
    }),
  });
  assert.notEqual(result.stopped, "invalid-plan", "tests 空の unit は seam 要求を発火させない");
});

test("抽出での unit / test の silent drop は stopped: extraction-mismatch で決定論検出される", async () => {
  const body = bodyFor(["U-001", "U-002"], ["T-001", "T-002", "T-003"]);
  const base = makePlan().units[0];

  // case A: unit U-002 を silent drop (test id は全部返す)
  const unitDrop = makePlan({
    units: [
      {
        ...base,
        tests: [
          { ...base.tests[0], id: "T-001" },
          { ...base.tests[0], id: "T-002" },
          { ...base.tests[0], id: "T-003" },
        ],
      },
    ],
  });
  const a = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ body, plan: unitDrop }),
  });
  assert.equal(
    a.result.stopped,
    "extraction-mismatch",
    "unit drop で stopped: extraction-mismatch",
  );
  assert.ok(
    JSON.stringify(a.result.detail).includes("U-002"),
    "不一致 unit id U-002 が detail に載る",
  );

  // case B: test id T-003 を 1 件 silent drop (unit id は全部返す)
  const testDrop = makePlan({
    units: [
      { ...base, tests: [{ ...base.tests[0], id: "T-001" }] },
      {
        ...base,
        id: "U-002",
        tests: [{ ...base.tests[0], id: "T-002" }],
        // seam 検査でなく id クロスチェックを見るケースなので seam は満たしておく
        seam: true,
      },
    ],
  });
  const b = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ body, plan: testDrop }),
  });
  assert.equal(
    b.result.stopped,
    "extraction-mismatch",
    "test drop で stopped: extraction-mismatch",
  );
  assert.ok(
    JSON.stringify(b.result.detail).includes("T-003"),
    "不一致 test id T-003 が detail に載る",
  );
});

test("契約 prose 中の T-NNN 参照は定義でないので cross-check に載らず extraction-mismatch にならない", async () => {
  // contract 文の「既存の T-106 は変更しない」は参照であって定義ではない。
  // 定義された受け入れテストは T-109 のみで、抽出も T-109 のみを返す。
  const body = [
    "## Plan",
    "",
    "Outcome: sample outcome",
    "test_command: echo test",
    "",
    "### U-001: unit の見出し",
    "",
    "- contract: 既存の T-106 とプロダクションコードは変更しない",
    "",
    "受け入れテスト。",
    "",
    "- T-109: test scenario",
    "",
  ].join("\n");
  const base = makePlan().units[0];
  const plan = makePlan({
    units: [{ ...base, tests: [{ ...base.tests[0], id: "T-109" }] }],
  });
  const r = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ body, plan }),
  });
  assert.notEqual(
    r.result.stopped,
    "extraction-mismatch",
    "prose 参照 T-106 を欠落テストと誤検出しない",
  );
});

// UNIT_CAPS (files: 3, tests: 4) の超過検出。id クロスチェック通過後、extract 経路に
// 限って発火する。seam: true の unit は境界跨ぎテストで files が正当に増えるため対象外。
test('extract 経路で files 4 つの非 seam unit を含む plan は stopped "oversized-unit" で停止する', async () => {
  const body = bodyFor(["U-001"], ["T-001"]);
  const plan = makePlan({
    units: [
      {
        id: "U-001",
        goal: "sample goal",
        files: ["a.js", "b.js", "c.js", "d.js"],
        contract: "sample contract",
        tests: [{ id: "T-001", name: "sample spec statement" }],
        seam: false,
      },
    ],
  });
  const { result } = await runWorkflow(buildJs, { args, stubs: makeStubs({ body, plan }) });
  assert.equal(
    result.stopped,
    "oversized-unit",
    "files 4 つの非 seam unit で stopped: oversized-unit",
  );
});

test('extract 経路で tests 5 個の非 seam unit を含む plan は stopped "oversized-unit" で停止する', async () => {
  const tests = Array.from({ length: 5 }, (_, i) => ({
    id: `T-00${i + 1}`,
    name: `sample spec statement ${i + 1}`,
  }));
  const body = bodyFor(
    ["U-001"],
    tests.map((t) => t.id),
  );
  const plan = makePlan({
    units: [
      {
        id: "U-001",
        goal: "sample goal",
        files: ["a.js"],
        contract: "sample contract",
        tests,
        seam: false,
      },
    ],
  });
  const { result } = await runWorkflow(buildJs, { args, stubs: makeStubs({ body, plan }) });
  assert.equal(
    result.stopped,
    "oversized-unit",
    "tests 5 個の非 seam unit で stopped: oversized-unit",
  );
});

test("seam: true の unit は files 4 つでも上限検出の対象にならず build は続行する", async () => {
  const body = bodyFor(["U-001"], ["T-001"]);
  const plan = makePlan({
    units: [
      {
        id: "U-001",
        goal: "sample goal",
        files: ["a.js", "b.js", "c.js", "d.js"],
        contract: "sample contract",
        tests: [{ id: "T-001", name: "sample spec statement" }],
        seam: true,
      },
    ],
  });
  const { result, calls } = await runWorkflow(buildJs, { args, stubs: makeStubs({ body, plan }) });
  assert.notEqual(
    result.stopped,
    "oversized-unit",
    "seam: true の unit は files 4 つでも stopped: oversized-unit にならない",
  );
  assert.ok(calls.phase.includes("Ship"), "seam: true の unit が files 4 つでも Ship まで続行する");
});

test("files 3 つ / tests 4 個の上限値ちょうどの plan は停止せず既存挙動のまま続行する", async () => {
  const tests = Array.from({ length: 4 }, (_, i) => ({
    id: `T-00${i + 1}`,
    name: `sample spec statement ${i + 1}`,
  }));
  const body = bodyFor(
    ["U-001"],
    tests.map((t) => t.id),
  );
  const plan = makePlan({
    units: [
      {
        id: "U-001",
        goal: "sample goal",
        files: ["a.js", "b.js", "c.js"],
        contract: "sample contract",
        tests,
        seam: false,
      },
    ],
  });
  const { result, calls } = await runWorkflow(buildJs, { args, stubs: makeStubs({ body, plan }) });
  assert.notEqual(
    result.stopped,
    "oversized-unit",
    "files 3 / tests 4 の上限値ちょうどは stopped: oversized-unit にならない",
  );
  assert.ok(calls.phase.includes("Ship"), "上限値ちょうどの plan は Ship まで続行する (既存挙動)");
});

// 上限の実体は UNIT_CAPS にしか無く、/think Phase 3 はそれを prose で複写している。
// 片側だけ変えても実行時には何も落ちないので、この静的照合が同一コミットでの追従を強制する。
const thinkSkill = join(here, "..", "..", "..", "skills", "think", "SKILL.md");

test("UNIT_CAPS の数値と seam 除外が /think SKILL.md の unit 上限記述と一致する", () => {
  const caps = readFileSync(buildJs, "utf8").match(
    /const UNIT_CAPS = \{ files: (\d+), tests: (\d+) \};/,
  );
  assert.ok(caps, "build.js から UNIT_CAPS の数値を読める");
  const skill = readFileSync(thinkSkill, "utf8");
  assert.ok(
    skill.includes(`files ${caps[1]} つ、tests ${caps[2]} 個`),
    `SKILL.md が上限を files ${caps[1]} / tests ${caps[2]} と書いている`,
  );
  assert.match(skill, /non-seam unit の上限/, "SKILL.md の上限が non-seam 限定と書かれている");
  assert.match(
    skill,
    /seam unit .{0,60}この上限の対象外/,
    "SKILL.md が seam unit を上限の対象外と書いている",
  );
});

// draftPlan (## Plan 節なし) 経路にも UNIT_CAPS 超過検出を適用する。generate agent の初回
// plan が超過なら、超過 unit 一覧を feedback して generate agent を 1 回だけ再実行する
// (critique-plan は攻撃項目に unit 肥大が増えるだけで、肥大単独で NO-GO にはしない)。
const draftPlanBody = "Plan 見出しの無い issue 本文。\n\n## Context\n\n説明のみ。";
const oversizedDraftPlan = () =>
  makePlan({
    units: [
      {
        id: "U-001",
        goal: "sample goal",
        files: ["a.js", "b.js", "c.js", "d.js"],
        contract: "sample contract",
        tests: [{ id: "T-001", name: "sample spec statement" }],
        seam: false,
      },
    ],
  });
const withinCapsDraftPlan = () => makePlan();
// generate-plan の呼び出し順に responses を返す stub (最後の要素は以降の呼び出しにも使い回す)。
// critique-plan / fetch など他の agent 呼び出しは makeStubs の既定 (critique: GO) を使う。
const stubsWithGenerateSequence = (responses) => {
  const base = makeStubs({ body: draftPlanBody });
  let callIndex = 0;
  return {
    ...base,
    agent: (prompt, opts) => {
      if (opts.label !== "generate-plan") return base.agent(prompt, opts);
      const plan = responses[Math.min(callIndex, responses.length - 1)];
      callIndex += 1;
      return plan;
    },
  };
};

test("draftPlan 経路で超過 plan が返ると generate agent が超過 unit 一覧の feedback 付きで 1 回だけ再実行される", async () => {
  const run = await runWorkflow(buildJs, {
    args,
    stubs: stubsWithGenerateSequence([oversizedDraftPlan(), withinCapsDraftPlan()]),
  });

  const generateCalls = agentCallsByLabel(run.calls, "generate-plan");
  assert.equal(generateCalls.length, 2, "generate agent が初回 + 再実行の計 2 回だけ呼ばれる");
  assert.ok(
    generateCalls[1].prompt.includes("U-001"),
    "再実行の prompt に超過した unit id U-001 が feedback として載る",
  );
});

test("再生成後の plan が上限内なら build は続行する", async () => {
  const run = await runWorkflow(buildJs, {
    args,
    stubs: stubsWithGenerateSequence([oversizedDraftPlan(), withinCapsDraftPlan()]),
  });

  const generateCalls = agentCallsByLabel(run.calls, "generate-plan");
  assert.equal(
    generateCalls.length,
    2,
    "上限内に収まった再生成後は generate agent をこれ以上呼ばない (再実行は 1 回のみ)",
  );
  assert.notEqual(
    run.result.stopped,
    "oversized-unit",
    "再生成後に上限内なら stopped: oversized-unit にならない",
  );
  assert.ok(run.calls.phase.includes("Ship"), "再生成後に上限内なら Ship まで続行する");
});

test('再生成後も超過が残る plan は stopped "oversized-unit" で停止する', async () => {
  const run = await runWorkflow(buildJs, {
    args,
    stubs: stubsWithGenerateSequence([oversizedDraftPlan()]),
  });

  const generateCalls = agentCallsByLabel(run.calls, "generate-plan");
  assert.equal(
    generateCalls.length,
    2,
    "再生成後も超過が残る場合、再実行は 1 回だけで無限ループしない",
  );
  assert.equal(
    run.result.stopped,
    "oversized-unit",
    "再生成後も超過が残る plan は stopped: oversized-unit で停止する",
  );
});

test("Revalidate は 1 miss で stopped: plan-drift、全 pass で Branch へ進み、preconditions 空なら agent を呼ばない", async () => {
  // miss case: exists: false を 1 件含む
  const driftPlan = makePlan({
    preconditions: [
      { path: "sample.js", pattern: "sampleSymbol" },
      { path: "missing.js", pattern: "goneSymbol" },
    ],
  });
  const miss = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      plan: driftPlan,
      revalidate: {
        results: [
          {
            path: "sample.js",
            pattern: "sampleSymbol",
            exists: true,
            matches: true,
          },
          {
            path: "missing.js",
            pattern: "goneSymbol",
            exists: false,
            matches: false,
          },
        ],
      },
    }),
  });
  assert.equal(miss.result.stopped, "plan-drift", "1 miss で stopped: plan-drift");
  assert.ok(
    JSON.stringify(miss.result).includes("missing.js"),
    "drift 一覧に miss した path が載る",
  );
  assert.ok(!miss.calls.phase.includes("Branch"), "plan-drift 後に Branch へ進まない");

  // all-pass case: Branch phase に到達する
  const pass = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs(),
  });
  assert.ok(pass.calls.phase.includes("Branch"), "全 pass で Branch phase に到達する");

  // 空 case: revalidate agent が呼ばれず Branch に到達する
  const empty = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ plan: makePlan({ preconditions: [] }) }),
  });
  assert.equal(
    agentCallsOf(empty.calls, "revalidate").length,
    0,
    "preconditions 空で revalidate agent が呼ばれない",
  );
  assert.ok(empty.calls.phase.includes("Branch"), "preconditions 空でも Branch phase に到達する");
});

test("happy path の phase 順が Load → Revalidate → Branch → Code → Cleanup → Verify → Ship で、code に model: sonnet が渡り audit / polish / challenge / think / research が呼ばれない", async () => {
  const { calls } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs(),
  });

  assert.deepEqual(
    calls.phase,
    ["Load", "Revalidate", "Branch", "Code", "Cleanup", "Verify", "Ship"],
    "phase 順が Load → Revalidate → Branch → Code → Cleanup → Verify → Ship (cleanup 後の tree を検証する)",
  );

  const codeCalls = calls.workflow.filter((c) => c.name === "code");
  assert.equal(codeCalls.length, 1, "workflow('code') が 1 回呼ばれる");
  assert.equal(codeCalls[0].args.model, "sonnet", "code に model: sonnet が渡る");
  assert.ok(
    !("preconditions" in codeCalls[0].args.plan),
    "code へ渡す plan から preconditions が strip される",
  );

  const cleanupCalls = agentCallsOf(calls, "cleanup");
  assert.equal(
    cleanupCalls.length,
    1,
    "cleanup agent (simplify skill + test 検証) が 1 回呼ばれる",
  );
  assert.equal(cleanupCalls[0].opts.model, "sonnet", "cleanup agent は sonnet 固定");

  // sibling() は素の dev tree 形 (code) を先に試し、解決すれば build:code に fallback しない。
  // dev tree では code が返るので capture には code のみが現れる。audit は集合に現れない (DR-0085)。
  const names = new Set(calls.workflow.map((c) => c.name));
  assert.deepEqual(
    [...names].sort(),
    ["code"],
    "workflow capture に dev-tree の code のみが現れる (build:code に fallback しない)",
  );
  for (const banned of ["audit", "polish", "challenge", "think", "research"]) {
    assert.ok(!names.has(banned), `workflow('${banned}') が呼ばれない`);
  }
});

// ---- Verify: 決定論スコープ検査 + T-NNN 言明照合 (DR-0085 の選択ベース担保) ----

test("Verify のスコープ検査が plan 外の diff file を surface し、.claude/workspace/ 配下は除外する", async () => {
  const { calls, result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      diff: {
        files: ["sample.js", "extra.js", ".claude/workspace/planning/2026-07-03-sample/plan.json"],
      },
    }),
  });
  assert.deepEqual(
    result.scope_deviations,
    ["extra.js"],
    "plan files 外かつ .claude/workspace/ 外の file だけが scope_deviations に載る",
  );
  const shipCalls = agentCallsOf(calls, "ship");
  assert.ok(
    shipCalls[0].prompt.includes('"scope_deviations":["extra.js"]'),
    "scope_deviations が ship prompt (PR body payload) に載る",
  );
  assert.ok(calls.phase.includes("Ship"), "スコープ逸脱があっても fail-open で Ship まで進む");
});

test("Verify の T-NNN 照合が見つからない言明を surface し、verifier への relay prompt に checks JSON が載る", async () => {
  const { calls, result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      presence: { results: [{ name: "sample spec statement", found: false }] },
    }),
  });
  assert.deepEqual(
    result.missing_tests,
    ["sample spec statement"],
    "found: false の言明が missing_tests に載る",
  );
  const shipCalls = agentCallsOf(calls, "ship");
  assert.ok(
    shipCalls[0].prompt.includes('"missing_tests":["sample spec statement"]'),
    "missing_tests が ship prompt (PR body payload) に載る",
  );

  const presenceCalls = agentCallsOf(calls, "presence");
  assert.equal(presenceCalls.length, 1, "verify-tests relay agent が 1 回呼ばれる");
  assert.ok(
    presenceCalls[0].prompt.includes("verify-tests.py"),
    "relay prompt が決定論 verifier verify-tests.py を指す",
  );
  assert.ok(
    presenceCalls[0].prompt.includes('"names":["sample spec statement"]'),
    "relay prompt に unit の files + names の checks JSON が載る",
  );
  assert.ok(calls.phase.includes("Ship"), "言明の欠落があっても fail-open で Ship まで進む");
});

test("Verify の diff / presence が落ちても fail-open で Ship まで進み、未検証が明示される", async () => {
  const { calls, result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ diff: null, presence: null }),
  });
  assert.ok(
    String(result.scope_deviations[0]).includes("scope 未検証"),
    "diff 不在は「スコープ未検証」として surface する (silent clean にしない)",
  );
  assert.ok(
    String(result.missing_tests[0]).includes("presence 未検証"),
    "presence 不在は「言明未検証」として surface する (silent clean にしない)",
  );
  assert.ok(calls.phase.includes("Ship"), "fail-open で Ship phase まで進む");
});

test("tests 空の unit は invalid-plan にならず、言明 0 件なら presence relay agent を呼ばない", async () => {
  const plan = makePlan({
    units: [
      {
        id: "U-001",
        goal: "docs goal",
        files: ["sample.js"],
        contract: "docs contract",
        tests: [],
      },
    ],
  });
  const { calls, result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ body: bodyFor(["U-001"], []), plan }),
  });
  assert.equal(
    result.stopped,
    undefined,
    "tests 空の unit で fail-close しない (plan の選択として合法)",
  );
  assert.equal(
    agentCallsOf(calls, "presence").length,
    0,
    "宣言された言明が 0 件なら verify-tests relay agent を呼ばない",
  );
  assert.deepEqual(result.missing_tests, [], "照合対象が無いので missing_tests は空");
  assert.ok(calls.phase.includes("Ship"), "直接実装 unit だけの plan でも Ship まで完走する");
});

// ---- DR-0088: unit ごとの commit と分岐点基準の diff ----
// Code が unit ごとに commit すると HEAD は分岐点でなくなる。Verify の 3 つの review が
// `git diff HEAD` のままだと差分が空になり、scope 逸脱も conformance も無言で 0 件に
// なる (可視の失敗ではなく silent pass)。基準を Branch が返す分岐点 sha に固定する。

const refPlan = () =>
  makePlan({
    reference_module: { path: "src/existing", files: ["src/existing/index.ts"] },
  });

test("Verify の diff / conformance / structure が Branch の分岐点 sha を基準にし、素の git diff HEAD を使わない", async () => {
  const { calls } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ plan: refPlan() }),
  });
  const sha = "a1b2c3d4e5f6a7b8";
  const reviewPrompts = calls.agent
    .filter((c) => ["diff-files", "conformance", "structure"].includes(c.opts.label))
    .map((c) => ({ label: c.opts.label, prompt: c.prompt }));
  assert.equal(reviewPrompts.length, 3, "diff-files / conformance / structure の 3 つが走る");
  for (const { label, prompt } of reviewPrompts) {
    assert.ok(prompt.includes(`git diff ${sha}`), `${label} の diff 基準が分岐点 sha になる`);
    assert.ok(
      !/git diff HEAD\b/.test(prompt),
      `${label} に素の git diff HEAD が残っていない (unit commit 後は空になる)`,
    );
  }
});

test("code に commit: true / issue / untracked_baseline が渡り、戻り値 unit_commits に件数が載る", async () => {
  const { calls, result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      untracked: { untracked: ["notes/local-memo.md"] },
      code: {
        completed: ["U-001"],
        anomalies: [],
        commits: [{ unit: "U-001", subject: "feat: sample subject" }],
        tests_pass: true,
        gates_pass: true,
      },
    }),
  });
  const codeArgs = calls.workflow.find((c) => c.name === "code").args;
  assert.equal(codeArgs.commit, true, "分岐点 sha があるとき code に commit: true が渡る");
  assert.equal(codeArgs.issue, "123", "commit trailer 用に issue 番号が渡る");
  assert.deepEqual(
    codeArgs.untracked_baseline,
    ["notes/local-memo.md"],
    "build 以前からの未追跡パスが never-stage 集合として渡る",
  );
  assert.equal(result.unit_commits, 1, "戻り値 unit_commits に unit commit 件数が載る");
});

// 分岐点 sha を取れないまま unit commit を有効にすると、比較対象を失った Verify が
// 無言で全 pass する。sha が使えないときは commit を止めて従来の HEAD 基準へ退避する。
test("head が sha でないときは code の commit を false にし diff 基準を HEAD へ戻す", async () => {
  for (const branch of [
    { branch: "feat/sample-branch", head: "" },
    { branch: "feat/sample-branch", head: "not-a-sha" },
  ]) {
    const { calls, result } = await runWorkflow(buildJs, {
      args,
      stubs: makeStubs({ branch, plan: refPlan() }),
    });
    const codeArgs = calls.workflow.find((c) => c.name === "code").args;
    assert.equal(codeArgs.commit, false, `head=${JSON.stringify(branch.head)} で commit: false`);
    const diffCall = calls.agent.find((c) => c.opts.label === "diff-files");
    assert.ok(
      diffCall.prompt.includes("git diff HEAD --name-only"),
      "per-unit commit 無効時は従来どおり HEAD 基準で diff する",
    );
    assert.equal(result.stopped, undefined, "sha が取れなくても fail-close しない");
  }
});

// unit が既に履歴にあるので、Ship は残余だけを commit し、残余ゼロを正常終了として扱う。
test("per-unit commit 有効時の Ship prompt は残余 commit 指示になり、空なら skip を許す", async () => {
  const withCommits = await runWorkflow(buildJs, { args, stubs: makeStubs() });
  const shipPrompt = agentCallsOf(withCommits.calls, "ship")[0].prompt;
  assert.match(shipPrompt, /commit 自体を skip/, "残余が空なら commit を skip してよいと指示する");

  const fallback = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ branch: { branch: "feat/sample-branch", head: "" } }),
  });
  const fallbackPrompt = agentCallsOf(fallback.calls, "ship")[0].prompt;
  assert.notEqual(
    shipPrompt,
    fallbackPrompt,
    "per-unit commit 無効時は単一 commit 指示に戻り、prompt が変わる",
  );
});

test("stopped 値集合の snapshot が 14 値と exact match し、audit 経路の残骸が無い", () => {
  const source = readFileSync(buildJs, "utf8");
  const stopped = new Set();
  for (const m of source.matchAll(/stopped:\s*"([^"]+)"/g)) stopped.add(m[1]);
  assert.deepEqual(
    [...stopped].sort(),
    [
      "code-failed",
      "dirty-branch-point",
      "extraction-failed",
      "extraction-mismatch",
      "generated-plan-rejected",
      "invalid-plan",
      "no-issue",
      "no-issue-body",
      "no-repo",
      "oversized-unit",
      "plan-drift",
      "plan-generation-failed",
      "revalidate-failed",
      "revalidate-incomplete",
    ],
    "stopped リテラル集合が 14 値と exact match する (base 指定時の分岐点汚染検出で dirty-branch-point が build.js に入る)",
  );
  const explore = source.match(/agentType:\s*"Explore"/g) || [];
  assert.equal(explore.length, 0, 'agentType: "Explore" が 0 件');
  // DR-0085 の regression guard: audit fan-out / fix loop の残骸が無い。
  assert.ok(!source.includes('sibling("audit"'), "audit workflow の呼び出しが残っていない");
  assert.ok(!source.includes("MAX_FIX_ROUNDS"), "fix → 再監査 loop が残っていない");
  assert.ok(!source.includes("reaudited"), "reaudited flag が残っていない");
});

// build は起票せず、scope 外候補を戻り値 backlog_candidates にのみ surface する。
// PR body には出さない (レビュー対象でないため)。ユーザーは戻り値から /issue で起票する。
test("Backlog 候補は PR body に出さず戻り値 backlog_candidates にのみ surface する", async () => {
  const plan = makePlan({
    backlog_candidates: [{ summary: "issue 由来の scope 外候補" }],
  });
  const { calls, result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ plan }),
  });

  // 候補は Ship の PR body prompt には載らない
  const shipCalls = agentCallsOf(calls, "ship");
  assert.equal(shipCalls.length, 1, "ship agent が 1 回呼ばれる");
  assert.ok(
    !shipCalls[0].prompt.includes("issue 由来の scope 外候補"),
    "ship prompt (PR body) に backlog 候補 summary が載らない",
  );

  // 候補は戻り値にのみ surface する
  assert.ok(Array.isArray(result.backlog_candidates), "戻り値に backlog_candidates 配列が載る");
  assert.ok(
    result.backlog_candidates.some(
      (c) => c.source === "issue" && c.summary === "issue 由来の scope 外候補",
    ),
    "backlog_candidates に source: issue の候補が載る",
  );
});

// reviewer-conformance の Spec 軸 findings は決定論の逸脱リスト (scope / missing) と混ぜず、
// 独立軸として Ship の PR body payload と戻り値 conformance_findings に surface する。
test("conformance findings が独立軸として surface し、決定論の逸脱リストに混ざらない", async () => {
  const { calls, result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      conformance: {
        spec_found: true,
        findings: [
          {
            category: "missing",
            spec_line: "T-003 rejects negative",
            location: "pay.js:12",
            detail: "no test for T-003",
          },
        ],
      },
    }),
  });

  // 候補は Ship の PR body payload (shipPayload JSON) に載る
  const shipCalls = agentCallsOf(calls, "ship");
  assert.equal(shipCalls.length, 1, "ship agent が 1 回呼ばれる");
  assert.ok(
    shipCalls[0].prompt.includes("no test for T-003"),
    "ship prompt (PR body payload) に conformance finding の detail が載る",
  );

  const confCalls = agentCallsOf(calls, "conformance");
  assert.equal(
    confCalls[0].opts.model,
    "sonnet",
    "conformance は sonnet 固定 (session model を継承しない)",
  );

  // 戻り値の conformance_findings に件数が surface する
  assert.equal(result.conformance_findings, 1, "戻り値 conformance_findings が 1");

  // 独立軸: 決定論の逸脱リストには混ざらない
  assert.deepEqual(
    result.scope_deviations,
    [],
    "conformance finding は scope_deviations に混ざらない",
  );
  assert.deepEqual(result.missing_tests, [], "conformance finding は missing_tests に混ざらない");
});

// tail の情報系セクション (assumptions / conformance / anomaly) の自由記述は reviewer が
// 英語で吐くので、Ship 直前に対象言語へ翻訳 + 圧縮する。訳文が shipPayload に反映され、
// ship prompt (PR body payload) に載ることを検証する。
test("translate-tail の訳文が shipPayload に反映され ship prompt に載る", async () => {
  const plan = makePlan({
    assumptions: ["assume in EN"],
  });
  const { calls } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      plan,
      conformance: {
        spec_found: true,
        findings: [
          { category: "missing", spec_line: "L1", location: "a.js:1", detail: "conf in EN" },
        ],
      },
      // 入力配列は prompt の最終行 (言語マーカーに依存しない)。各 {id,text} の text を
      // JA<...> でラップし、id を付けて返す。
      translate: (prompt) => {
        const arr = JSON.parse(prompt.trim().split("\n").pop());
        return { translations: arr.map((o) => ({ id: o.id, text: `JA<${o.text}>` })) };
      },
    }),
  });

  // translate agent は slots が非空 (assumption + conformance) なので 1 回呼ばれる
  const translateCalls = agentCallsOf(calls, "translate");
  assert.equal(translateCalls.length, 1, "translate-tail agent が 1 回呼ばれる");

  // 訳文が ship prompt (shipPayload JSON) に載り、英語原文は残らない
  const shipCalls = agentCallsOf(calls, "ship");
  assert.equal(shipCalls.length, 1, "ship agent が 1 回呼ばれる");
  assert.ok(
    shipCalls[0].prompt.includes("JA<conf in EN>"),
    "ship prompt に翻訳済み conformance detail が載る",
  );
  assert.ok(
    shipCalls[0].prompt.includes("JA<assume in EN>"),
    "ship prompt に翻訳済み assumption が載る",
  );
});

// 訳が id 順を入れ替えて返っても、消費側は id で突合して正しい slot へ書き戻す。
test("translate-tail の訳が順序入れ替えでも id で正しい slot に反映される", async () => {
  const plan = makePlan({
    assumptions: ["assume A"],
  });
  const { calls } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      plan,
      conformance: {
        spec_found: true,
        findings: [{ category: "missing", spec_line: "L1", location: "a.js:1", detail: "conf B" }],
      },
      // id を保ったまま順序を反転して返す (位置ベースなら取り違える)
      translate: (prompt) => {
        const arr = JSON.parse(prompt.trim().split("\n").pop());
        return { translations: arr.map((o) => ({ id: o.id, text: `JA<${o.text}>` })).reverse() };
      },
    }),
  });

  const shipCalls = agentCallsOf(calls, "ship");
  assert.equal(shipCalls.length, 1, "ship agent が 1 回呼ばれる");
  assert.ok(
    shipCalls[0].prompt.includes("JA<conf B>"),
    "順序反転でも conformance detail に自分の訳が載る",
  );
  assert.ok(
    shipCalls[0].prompt.includes("JA<assume A>"),
    "順序反転でも assumption に自分の訳が載る",
  );
});

// 訳の id が入力と一致しない (欠落・取り違え) とき、消費側は fail-open で英語原文を
// 維持し PR を block しない。
test("translate-tail の訳 id が入力と一致しないなら英語原文で ship を継続する", async () => {
  const { calls } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      conformance: {
        spec_found: true,
        findings: [
          { category: "missing", spec_line: "L1", location: "a.js:1", detail: "conf in EN" },
        ],
      },
      // slot 0 の訳が無く、存在しない id 5 の訳を返す (取り違え)
      translate: () => ({ translations: [{ id: 5, text: "only one" }] }),
    }),
  });

  const shipCalls = agentCallsOf(calls, "ship");
  assert.equal(shipCalls.length, 1, "ship agent が 1 回呼ばれる");
  assert.ok(
    shipCalls[0].prompt.includes("conf in EN"),
    "id 不一致時は英語原文の conformance detail が ship prompt に残る",
  );
  assert.ok(!shipCalls[0].prompt.includes("only one"), "id 不一致の訳は採用されない");
});

test("実環境で Plan 節付き issue が Load → Revalidate → Branch → Code → Cleanup → Verify と進み、Plan 節なし issue が draft-plan 経由で同じ順に進む (manual acceptance、done 前必須)", () => {
  // harness green だけで完了にしないための manual gate。実際に build workflow を
  // Plan 節付き / Plan 節なしの実 issue で起動し、前者の phase log が
  // Load → Revalidate → Branch → Code → Cleanup → Verify の順に出て PR tail に /audit 案内が載ること、
  // 後者が draft-plan で plan を下書きし同じ順に進む (assumptions 先頭に自動生成注記) ことを確認したら
  // ADR0085_MANUAL_ACCEPTANCE=pass を付けてテストを実行する。
  assert.equal(
    process.env.ADR0085_MANUAL_ACCEPTANCE,
    "pass",
    "manual acceptance 未実施。実 issue で build workflow を起動して確認後、ADR0085_MANUAL_ACCEPTANCE=pass で再実行する",
  );
});
