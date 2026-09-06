// TDD Red-step scaffold for Unit U-004 (issue #627): run-workflow.js's vm-based harness is
// ported to TypeScript here. This file exists only so a `.ts` specifier resolves --
// workflows/_lib/tests/meta-contract.test.js's T-045 imports `runWorkflow` from this path to
// prove a `.js` test can read a `.ts` module -- and so `workflows/tests/tsconfig-scope.test.js`'s
// T-044 finds this path in tsc's type-check set. The vm realm, the missing-globals set, and the
// Date/Math/error-shape behavior documented in run-workflow.js are ported in the Green step,
// not scaffolded here.
export interface RunWorkflowOptions {
  args?: Record<string, unknown>;
  stubs?: Record<string, unknown>;
  onLog?: (value: unknown) => void;
  onPhase?: (value: unknown) => void;
}

export interface RunWorkflowResult {
  result: unknown;
  calls: { agent: unknown[]; workflow: unknown[]; phase: unknown[] };
  logs: unknown[];
}

export async function runWorkflow(
  scriptPath: string,
  options: RunWorkflowOptions = {},
): Promise<RunWorkflowResult> {
  void scriptPath;
  void options;
  return { result: undefined, calls: { agent: [], workflow: [], phase: [] }, logs: [] };
}
