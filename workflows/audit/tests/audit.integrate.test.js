// Integrate 段が吸収した R-N id を root cause の source_ids に残す挙動と、その入力を
// survivors のみに絞る挙動 (disputed を再び integrate に渡さない) を固定する。
// Integrate は polish.js に対応する段が無く、id の追跡は audit.js 固有の要件になる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";
import { defaultAgentStub, callOf } from "./_fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const auditJs = join(here, "..", "..", "audit.js");

// Route -> Review (security / silence の 2 reviewer) -> Challenge/Verify -> Integrate まで
// 通す最小 stub。focus: "security" で rawFindings の id を R-1 (security) / R-2 (silence) に
// 固定する (既定応答は _fixtures.js の defaultAgentStub)。
const run = (opts) =>
  runWorkflow(auditJs, {
    args: { focus: "security", skipPreflight: true },
    stubs: { agent: defaultAgentStub(opts) },
  });

const BOTH_CONFIRMED = {
  verdicts: [
    { id: "R-1", verdict: "confirmed" },
    { id: "R-2", verdict: "confirmed" },
  ],
};

test("T-023 Integrate に渡す schema だけが source_ids を必須にし、reviewer 用は property ごと持たない", async () => {
  const { calls } = await run({ challenge: BOTH_CONFIRMED, integrate: { findings: [] } });
  const item = (label) => callOf(calls, label).opts.schema.properties.findings.items;

  const integrate = item("integrate");
  assert.ok(
    integrate.required.includes("source_ids"),
    "source_ids を required にしないと Integrate が省いても validation を通り、R-N の追跡が run ごとに切れる",
  );

  const reviewer = item("security");
  assert.equal(
    reviewer.properties.source_ids,
    undefined,
    "reviewer 用 schema は source_ids を持たず、捏造した id は additionalProperties: false が弾く",
  );
  assert.equal(
    reviewer.required.includes("source_ids"),
    false,
    "reviewer に source_ids は求めない",
  );
});

test("T-009 Integrate が返す finding の source_ids が返り値の findings に保持される", async () => {
  const { result, calls } = await run({
    challenge: BOTH_CONFIRMED,
    integrate: {
      findings: [
        {
          file: "sample.js",
          line: "1",
          severity: "high",
          summary: "root cause absorbing both findings",
          source_ids: ["R-1", "R-2"],
        },
      ],
    },
  });
  assert.deepEqual(
    result.findings[0].source_ids,
    ["R-1", "R-2"],
    "Integrate が返した source_ids がそのまま返り値の findings に乗る",
  );
  const integrateCall = callOf(calls, "integrate");
  assert.ok(integrateCall, "integrate agent が起動する");
  const itemSchema = integrateCall.opts.schema.properties.findings.items;
  assert.equal(
    itemSchema.properties.source_ids && itemSchema.properties.source_ids.type,
    "array",
    "FINDINGS_SCHEMA の finding item に source_ids (array) が定義されている",
  );
});

test("T-010 Integrate に渡す入力に disputed と判定された finding が含まれない", async () => {
  const { calls } = await run({
    challenge: {
      verdicts: [
        { id: "R-1", verdict: "confirmed" },
        { id: "R-2", verdict: "disputed" },
      ],
    },
    integrate: { findings: [] },
  });
  const integrateCall = callOf(calls, "integrate");
  assert.ok(integrateCall, "integrate agent が起動する");
  assert.doesNotMatch(
    integrateCall.prompt,
    /R-2/,
    "disputed と判定された R-2 は integrate への入力から外れる",
  );
});

test("T-011 Integrate が survivors を全件返した run の最終 findings は survivors と同数になる", async () => {
  const { result, calls } = await run({
    challenge: BOTH_CONFIRMED,
    // verify の自由記述には survivor の内容 (summary) を含めない。integrate プロンプトに
    // survivor の内容が乗るとしたら、それは survivors 入力自体からのみ、という前提を保つ。
    verify: "verify pass output",
    integrate: {
      findings: [
        {
          file: "sample.js",
          line: "1",
          severity: "high",
          summary: "security finding",
          source_ids: ["R-1"],
        },
        {
          file: "sample.js",
          line: "1",
          severity: "high",
          summary: "silence finding",
          source_ids: ["R-2"],
        },
      ],
    },
  });
  assert.equal(
    result.findings.length,
    result.survivors.length,
    "survivors を全件返した run の最終 findings は survivors と同数になる",
  );
  const integrateCall = callOf(calls, "integrate");
  assert.ok(integrateCall, "integrate agent が起動する");
  for (const s of result.survivors) {
    assert.match(
      integrateCall.prompt,
      new RegExp(s.message),
      `survivor ${s.id} (${s.message}) の内容が integrate への入力 (survivors) に乗る`,
    );
  }
});
