// Integrate 段が吸収した R-N id を root cause の source_ids に残す挙動と、その入力を
// survivors のみに絞る挙動 (disputed を再び integrate に渡さない) を固定する。
// polish.js には無い audit.js 固有の段 (Integrate) なので、rawFindings の id (R-N) を
// 起点にした組み方は audit.triage.test.js / audit.degradation.test.js と同じにする。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const auditJs = join(here, "..", "..", "audit.js");

// Route -> Review (security / silence の 2 reviewer) -> Challenge/Verify -> Integrate まで
// 通す最小 stub。focus: "security" で rawFindings の id を R-1 (security) / R-2 (silence) に
// 固定するのは他の audit.*.test.js と同じ組み方。
const agentStub =
  ({ challenge, verify, integrate } = {}) =>
  (prompt, opts) => {
    const label = opts && opts.label;
    if (label === "route") {
      return { files: [{ path: "sample.js", churn: 0 }] };
    }
    if (label === "security") {
      return {
        findings: [{ file: "sample.js", line: "1", severity: "high", summary: "security finding" }],
      };
    }
    if (label === "silence") {
      return {
        findings: [{ file: "sample.js", line: "1", severity: "high", summary: "silence finding" }],
      };
    }
    if (label === "challenge") return challenge;
    if (label === "verify") return verify !== undefined ? verify : "verify pass output";
    if (label === "integrate") return integrate;
    // snapshot は戻り値を消費しない経路にフォールバックさせるため undefined のまま。
    return undefined;
  };

const callOf = (calls, label) => calls.agent.find((c) => c.opts && c.opts.label === label);

const run = (opts) =>
  runWorkflow(auditJs, {
    args: { focus: "security", skipPreflight: true },
    stubs: { agent: agentStub(opts) },
  });

const BOTH_CONFIRMED = {
  verdicts: [
    { id: "R-1", verdict: "confirmed" },
    { id: "R-2", verdict: "confirmed" },
  ],
};

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
