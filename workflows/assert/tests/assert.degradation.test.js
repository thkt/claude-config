// U-004: assert workflow の adversarial stage stall を result.adversarial に記録する。
// T-004 adversarial agent が null を返した (stall) 時、result.adversarial が stall を示し、
//        adversarial が生存しつつテスト 0 件を書いた (genuine no-tests) 場合と区別できる。
// contract: workflows/assert.js の adversarialSummary shape (total / passed / failed /
// promoted / excluded) に従い、stall・未実行を示すフィールドを summary へ足す。adrift.js /
// shake.js の per-item stall accounting に倣い、structured token は英語 "no output / stall"
// で持つ (shake.js の smellScan と同じ)。EN 版と .ja 版でこの構造トークンは同一のため、本
// test は localized prose でなく返り値の構造トークンだけを検査し、EN/.ja で同一内容にする。
//
// stall marker は「stall した時だけ現れる文字列フィールド」を前提にする (shake.js の
// `...(shaken.smellScan ? { smellScan } : {})` と同じ pattern)。genuine no-tests には
// 当該フィールドが無いことを負側 assertion で要求するため、Green が `stall: false` の
// ような常時 present な boolean を足すと負側が誤って落ちる。stall は文字列トークンで、
// stall 時のみ emit する — これが本 test が Green に課す契約。
//
// adversarial stage は run 全体で 1 agent (per-target ではない) なので、区別の検証には
// 2 回の workflow 実行 (stall / genuine no-tests) を並べて比較する。bootstrap は
// worktree_ok / install ok / build pass を返して dynamicOk を真にし、adversarial agent が
// 実際に呼ばれる (= その null 返却が env skip でなく agent stall を表す) ようにする。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const assertJs = join(here, "..", "..", "assert.js");

// dynamicOk を真にする bootstrap 返り値 (worktree_ok true / install ok / build pass)。
const bootOk = {
  codex_available: true,
  mode: "target",
  diff_kind: "",
  scope_files: ["src/foo.js"],
  outcome: "absent",
  worktree_ok: true,
  worktree_path: "/tmp/assert-wt",
  install: "ok",
  build: "pass",
  reason: "",
};

// adversarial 以外の全 stage を通す最小 agent stub。advReturn を adversarial stage の
// 返り値に差し込む (null = stall、{ ran: true, tests: [] } = genuine no-tests)。
const makeAgent = (advReturn) => (prompt, opts) => {
  const label = opts && opts.label;
  if (label === "bootstrap") return bootOk;
  if (label === "test-exec") return { outcome: "pass", passed: 1, failed: 0 };
  if (label === "adversarial") return advReturn;
  if (label === "codex-review") return { ran: true, findings: [] };
  if (label === "synthesize") return { issues: [], root_causes: [], report: "ok" };
  if (label === "cleanup") return {};
  return undefined;
};

test("adversarial agent が null を返す時、result.adversarial が stall を示しテスト 0 件と区別できる", async () => {
  const stallRun = await runWorkflow(assertJs, {
    args: {},
    stubs: { agent: makeAgent(null) }, // adversarial agent stall
  });
  const zeroRun = await runWorkflow(assertJs, {
    args: {},
    stubs: { agent: makeAgent({ ran: true, tests: [] }) }, // 生存・テスト 0 件
  });

  const stallAdv = stallRun.result && stallRun.result.adversarial;
  const zeroAdv = zeroRun.result && zeroRun.result.adversarial;
  assert.ok(stallAdv, "stall 時も result.adversarial が返る");
  assert.ok(zeroAdv, "genuine no-tests 時も result.adversarial が返る");

  const stallText = JSON.stringify(stallAdv);
  const zeroText = JSON.stringify(zeroAdv);

  assert.ok(
    /stall|no output/i.test(stallText),
    "adversarial agent が stall した時 result.adversarial に stall marker が記録される",
  );
  assert.ok(
    !/stall|no output/i.test(zeroText),
    "genuine no-tests には stall marker が無く、stall と 0 件を区別できる",
  );
});

test("adversarial agent が ran: false を自己申告した時、result.adversarial が診断理由付きで未実行を示す", async () => {
  const selfSkipRun = await runWorkflow(assertJs, {
    args: {},
    stubs: { agent: makeAgent({ ran: false, tests: [], notes: "sandbox denied codex exec" }) },
  });
  const adv = selfSkipRun.result && selfSkipRun.result.adversarial;
  assert.ok(adv, "自己申告未実行時も result.adversarial が返る");
  assert.equal(
    adv.stall,
    "not run: sandbox denied codex exec",
    "自己申告の未実行は診断理由 notes 付きで記録され、agent 無出力 (no output / stall) と区別できる",
  );
});

test("triage block 内で throw が起きた時、result.adversarial が stall を示しテスト 0 件と区別できる", async () => {
  // testRunP / adversarialP は agent 側で .catch(() => null) 済みのため、block throw の再現には
  // catch なしで await parallel される triage verdict agent (label "triage:*") を使う。harness の
  // parallel は thunk の throw で reject するので IIFE ごと throw し、外側の .catch(() => null)
  // が triageRes を null に畳む。この throw class 全体で stall marker が summary に残ることを
  // 固定する。
  const failTest = {
    test_name: "t1",
    target: "src/foo.js:3",
    assertion: "x",
    result: "FAIL",
    failure_detail: "boom",
  };
  const throwingAgent = (prompt, opts) => {
    const label = opts && opts.label;
    if (label && label.startsWith("triage:")) throw new Error("triage agent crashed");
    return makeAgent({ ran: true, tests: [failTest] })(prompt, opts);
  };
  const thrownRun = await runWorkflow(assertJs, { args: {}, stubs: { agent: throwingAgent } });
  const adv = thrownRun.result && thrownRun.result.adversarial;
  assert.ok(adv, "throw 時も result.adversarial が返る");
  assert.equal(
    adv.stall,
    "triage stage threw / no output",
    "triage block の throw が stall として記録され、clean な 0 件と区別できる",
  );
});

// U-002: 入れ子の workflow("audit") が fail-open (challenge_ran=false) した run では、
// audit findings を critic 検証済みと呼ばず、gate も Ready にならない。
// T-004 audit が challenge_ran=false を返した run の Synthesize prompt は audit findings を
//       critic 検証済みと書かない
// T-005 audit が challenge_ran=true を返した run の文言は変わらない
// T-006 audit が challenge_ran=false で issues が0件の run の gate は Ready ではなく
//       Ready (caveat) になる
// T-007 audit が challenge_ran=true で issues が0件かつ tests が pass の run の gate は
//       Ready のままになる
// T-009 audit が findings 0件かつ challenge_ran=false を返した run の gate も Ready ではなく
//       Ready (caveat) になる
//
// contract: workflows/assert.js の challengeStalled (verification signal が run しなかったこと
// を示す boolean を script が計算する形) と同じ形で auditDegraded を計算する。audit.js 自身の
// challenge_ran は「verdicts を返した run」と「fail-open (challenge が走らず全件 confirmed に
// なった run)」を区別する値なので、challenge_ran===false を degraded とみなす。findings 0件の
// 早期 return も challenge_ran=false を返し、reviewer が何も出さず challenge も走らなかった run
// が issues 0件のまま Ready に届く穴そのものなので、件数では除外しない。劣化を示す値は script が
// 計算し、agent には判定させない。Synthesize prompt の audit findings を紹介する一文は劣化時
// だけ切り替え、通常時 (challenge_ran=true) の "critic-verified" 文言は変えない。gate rule は
// Ready 分岐の条件に auditDegraded を加える (buildCol=pass, testsCol=pass, issues=0 でも
// degraded なら Ready でなく Ready (caveat) に落ちる)。

// challenge_ran だけを差し替え、findings は両ケースとも1件持たせる。findings 0件との組み合わせは
// T-009 が別に押さえる。
const makeAuditWorkflowStub = (challengeRan) => (name) =>
  name === "audit"
    ? {
        findings: [{ file: "a.js", line: 5, severity: "high", summary: "audit finding" }],
        challenge_ran: challengeRan,
        verify_ran: challengeRan,
      }
    : undefined;

// synthesize agent への呼び出しは opts.label === "synthesize" の 1 件のみなので、その prompt
// 文字列を取り出して audit findings の紹介文言を検査する。
const synthesizePromptOf = (calls) => {
  const call = calls.agent.find((c) => c.opts && c.opts.label === "synthesize");
  return (call && call.prompt) || "";
};

test("T-004 audit が challenge_ran=false を返した run の Synthesize prompt は audit findings を critic 検証済みと書かない", async () => {
  const { calls } = await runWorkflow(assertJs, {
    args: {},
    stubs: {
      agent: makeAgent({ ran: true, tests: [] }),
      workflow: makeAuditWorkflowStub(false),
    },
  });
  const prompt = synthesizePromptOf(calls);
  assert.ok(prompt.length > 0, "synthesize agent が呼ばれる");
  assert.ok(
    !/critic-verified/i.test(prompt),
    "audit の challenge が fail-open (challenge_ran=false) の run では audit findings を critic 検証済みと書かない",
  );
});

test("T-005 audit が challenge_ran=true を返した run の文言は変わらない", async () => {
  const { calls } = await runWorkflow(assertJs, {
    args: {},
    stubs: {
      agent: makeAgent({ ran: true, tests: [] }),
      workflow: makeAuditWorkflowStub(true),
    },
  });
  const prompt = synthesizePromptOf(calls);
  assert.ok(prompt.length > 0, "synthesize agent が呼ばれる");
  assert.ok(
    /critic-verified/i.test(prompt),
    "audit の challenge が正常に走った (challenge_ran=true) run の文言は既存の critic-verified 表記のままになる",
  );
});

test("T-006 audit が challenge_ran=false で issues が0件の run の gate は Ready ではなく Ready (caveat) になる", async () => {
  const { result } = await runWorkflow(assertJs, {
    args: {},
    stubs: {
      agent: makeAgent({ ran: true, tests: [] }),
      workflow: makeAuditWorkflowStub(false),
    },
  });
  assert.equal(
    result.gate,
    "Ready (caveat)",
    "audit が fail-open した run は issues 0件でも Ready でなく Ready (caveat) になる",
  );
});

test("T-007 audit が challenge_ran=true で issues が0件かつ tests が pass の run の gate は Ready のままになる", async () => {
  const { result } = await runWorkflow(assertJs, {
    args: {},
    stubs: {
      agent: makeAgent({ ran: true, tests: [] }),
      workflow: makeAuditWorkflowStub(true),
    },
  });
  assert.equal(
    result.gate,
    "Ready",
    "audit の challenge が正常に走った run は issues 0件かつ tests pass のとき Ready のままになる",
  );
});

test("T-009 audit が findings 0件かつ challenge_ran=false を返した run の gate は Ready ではなく Ready (caveat) になる", async () => {
  const { result } = await runWorkflow(assertJs, {
    args: {},
    stubs: {
      agent: makeAgent({ ran: true, tests: [] }),
      workflow: (name) =>
        name === "audit" ? { findings: [], challenge_ran: false, verify_ran: false } : undefined,
    },
  });
  assert.equal(
    result.gate,
    "Ready (caveat)",
    "reviewer が何も出さず challenge も走らなかった run は issues 0件でも Ready にならない",
  );
});

// U-003: audit workflow の返り値を実際に受け取った assert が、劣化を gate に反映する。
// T-008 は T-004〜T-007 と異なり、workflow("audit") を手書きオブジェクトへ置き換えない。
// assert.js の workflow stub から workflows/audit.js を runWorkflow でネストして本当に走らせ、
// audit.js 自身の challenge 段 (label "challenge") にだけ無出力を返して agent stall を再現する。
// challenge_ran は audit.js 側の fail-open ロジック
// (`!!(challenged && Array.isArray(challenged.verdicts))`) が自力で false に落とすので、
// このテストは challenge_ran を直接書かない。audit の返り値から assert の gate 計算までが
// 実際に繋がっていることが検証対象で、内部レイヤーのスタブ化はしない (seam unit の契約)。
const auditJs = join(here, "..", "..", "audit.js");

// audit.js の各 stage label に対応する最小応答。found した finding が1件、
// challenge/snapshot と他の reviewer は無出力 (undefined) のまま返し、
// challenge_ran=false と findings 非空を audit.js 自身の計算で導く。
const auditAgentStub = (prompt, opts) => {
  const label = opts && opts.label;
  if (label === "route") return { files: [{ path: "a.js", churn: 0 }] };
  if (label === "security")
    return { findings: [{ file: "a.js", line: 5, severity: "high", summary: "issue" }] };
  if (label === "verify") return "verified: execution path confirmed";
  if (label === "integrate")
    return {
      findings: [
        { file: "a.js", line: 5, severity: "high", summary: "issue", source_ids: ["R-1"] },
      ],
    };
  // "challenge" (audit.js 自身の challenge 段) / "snapshot" / 他の reviewer label は
  // 意図的に無出力のまま返す。audit.js の challengeRan は
  // `!!(challenged && Array.isArray(challenged.verdicts))` で自己計算されるため、
  // ここで challenge_ran を直接指定する必要はない。
  return undefined;
};

// assert.js の workflow("audit", wfArgs) を、audit.js を本当にネストで走らせる形に差し替える。
const runRealAudit = async (name, wfArgs) => {
  if (name !== "audit") return undefined;
  const { result } = await runWorkflow(auditJs, {
    args: wfArgs,
    stubs: { agent: auditAgentStub },
  });
  return result;
};

test("T-008 challenge を stub しない audit を入れ子で走らせた assert は、audit の challenge_ran=false を受け取って gate を Ready にしない", async () => {
  const { result } = await runWorkflow(assertJs, {
    args: {},
    stubs: {
      agent: makeAgent({ ran: true, tests: [] }),
      workflow: runRealAudit,
    },
  });
  assert.notEqual(
    result.gate,
    "Ready",
    "audit を実際に入れ子で走らせ challenge が fail-open (challenge_ran=false) になった run は gate が Ready にならない",
  );
});
