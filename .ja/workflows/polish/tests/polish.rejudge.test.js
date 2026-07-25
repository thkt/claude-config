// still_open から reopened への変換は agent でなく script 側の判定なので、
// fix agent の自己申告に引きずられない外形挙動としてここで固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const polishJs = join(here, "..", "..", "polish.js");

// Cleanup まで通す最小 stub。challenge の verdict と rejudge の返り値だけ差し替える。
const agentStub = ({ diffKind = "uncommitted", challenge, rejudge } = {}) => {
  const stub = (prompt, opts) => {
    const label = opts && opts.label;
    if (label === "codex") {
      return {
        available: true,
        has_changes: true,
        diff_kind: diffKind,
        findings: [
          { id: "F1", title: "finding title", detail: "finding detail", severity: "P1" },
          { id: "F2", title: "other title", detail: "other detail", severity: "P2" },
        ],
      };
    }
    if (label === "challenge") {
      return (
        challenge || {
          verdicts: [
            { id: "F1", verdict: "confirmed" },
            { id: "F2", verdict: "confirmed" },
          ],
        }
      );
    }
    if (label === "fix") {
      return { fixed: ["F1 fixed", "F2 fixed"], stashed: [], tests_pass: true };
    }
    if (label === "rejudge") {
      return rejudge;
    }
    if (label === "validate") {
      return { edits: [], tests_pass: true, stashed: false };
    }
    return undefined;
  };
  return stub;
};

const bothResolved = {
  verdicts: [
    { id: "F1", verdict: "resolved" },
    { id: "F2", verdict: "resolved" },
  ],
};

const callOf = (calls, label) => calls.agent.find((c) => c.opts && c.opts.label === label);

test("T-001 rejudge agent に survivor 一覧と post-fix diff の再判定指示が渡る", async () => {
  const uncommitted = await runWorkflow(polishJs, {
    args: {},
    stubs: { agent: agentStub({ diffKind: "uncommitted", rejudge: bothResolved }) },
  });
  const call = callOf(uncommitted.calls, "rejudge");
  assert.ok(call, "rejudge agent が起動する");
  assert.equal(call.opts.agentType, "critic-audit", "再判定は critic-audit が担う");
  assert.match(call.prompt, /"id":"F1"/, "survivor 一覧が prompt に載る");
  assert.match(call.prompt, /"id":"F2"/, "survivor 一覧が prompt に載る");
  assert.match(call.prompt, /git diff HEAD/, "uncommitted の post-fix diff は git diff HEAD");
  assert.deepEqual(
    call.opts.schema.properties.verdicts.items.properties.verdict.enum,
    ["resolved", "still_open"],
    "評決は resolved / still_open の 2 値",
  );

  const branch = await runWorkflow(polishJs, {
    args: {},
    stubs: { agent: agentStub({ diffKind: "branch", rejudge: bothResolved }) },
  });
  assert.match(
    callOf(branch.calls, "rejudge").prompt,
    /git diff main(?!\.)/,
    "branch の post-fix diff は base と working tree の 2 点 diff (fix は commit されないため)",
  );
});

test("T-002 still_open と判定された finding が reopened に id と severity 付きで載る", async () => {
  const { result } = await runWorkflow(polishJs, {
    args: {},
    stubs: {
      agent: agentStub({
        rejudge: {
          verdicts: [
            { id: "F1", verdict: "resolved" },
            { id: "F2", verdict: "still_open", why: "diff に該当変更なし" },
          ],
        },
      }),
    },
  });
  assert.deepEqual(result.reopened, [{ id: "F2", severity: "P2", why: "diff に該当変更なし" }]);
  assert.equal(result.rejudge_notes, "", "判定できたときは notes を付けない");
});

test("T-002b 評決が欠けた survivor は still_open 扱いで reopened に載る", async () => {
  const { result } = await runWorkflow(polishJs, {
    args: {},
    stubs: {
      agent: agentStub({ rejudge: { verdicts: [{ id: "F1", verdict: "resolved" }] } }),
    },
  });
  assert.deepEqual(
    result.reopened.map((r) => r.id),
    ["F2"],
    "評決から落ちた survivor を resolved に流さない",
  );
});

test("T-003 rejudge agent が結果を返さないとき reopened は null になり理由が付く", async () => {
  const { result } = await runWorkflow(polishJs, {
    args: {},
    stubs: { agent: agentStub({ rejudge: undefined }) },
  });
  assert.equal(result.reopened, null, "未判定を reopened 0 件と読み違えさせない");
  assert.match(result.rejudge_notes, /rejudge/, "未判定の理由が付く");
});

test("T-004 survivor がゼロのとき rejudge agent は起動しない", async () => {
  const { calls, result } = await runWorkflow(polishJs, {
    args: {},
    stubs: {
      agent: agentStub({
        challenge: {
          verdicts: [
            { id: "F1", verdict: "disputed" },
            { id: "F2", verdict: "disputed" },
          ],
        },
      }),
    },
  });
  assert.equal(result.survivors, 0);
  assert.equal(callOf(calls, "rejudge"), undefined);
  assert.deepEqual(result.reopened, [], "起動しないときの reopened は空配列");
});

test("T-005 mode review のとき rejudge agent は起動しない", async () => {
  const { calls, result } = await runWorkflow(polishJs, {
    args: { mode: "review" },
    stubs: { agent: agentStub({ rejudge: bothResolved }) },
  });
  assert.equal(callOf(calls, "rejudge"), undefined);
  assert.equal(result.reopened, undefined, "review の返り値に reopened は含まれない");
});
