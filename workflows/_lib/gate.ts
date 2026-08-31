#!/usr/bin/env node
/// <reference types="node" />
// Scaffold only. The full parity implementation is a later unit; this file exists so
// workflows/_lib/tests/gate.differential.test.ts can spawn a real `node` process and diff its
// report against gate.py's -- module-resolution or parse failure would hide every planned
// assertion behind one unrelated crash instead of the mismatch each test is meant to show.
// Contract: workflows/_lib/gate.py's own docstring (`--command`/`--cwd`/`--expect` and the
// rest of the flags), moved to TypeScript as-is.
//
// tsconfig.json declares no `types` array, and TypeScript 7's `moduleResolution: "bundler"`
// does not auto-include @types/node without one (confirmed against this repo's pinned
// typescript@7.0.2 in an isolated reproduction). Carrying the reference here keeps that gap
// out of this unit's file scope instead of editing tsconfig.json, which U-001 owns.
import { fileURLToPath } from "node:url";

export const REPORT_PROTOCOL = "claude-code-gate/v1";

export function main(_argv: string[]): number {
  const report = { protocol: REPORT_PROTOCOL, verdict: "pass" };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
