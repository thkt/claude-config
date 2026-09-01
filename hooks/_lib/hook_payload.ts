/// <reference types="node" />
// Scaffold only. The parity implementation is a later unit; every export here returns a fixed
// sentinel instead of reading the payload, so hooks/_lib/tests/hook-payload-parity.test.ts can
// import this module in process and diff its result against hook_payload.py's without a
// module-resolution or parse failure hiding the mismatch each test is meant to show.
//
// Contract: hooks/_lib/hook_payload.py's own docstring -- "json.loads returns Any, and
// isinstance narrows a dict only to dict[Unknown, Unknown], so a field read straight from the
// payload spreads Unknown through every caller a type checker follows. This module is the one
// place that admits it." TypeScript's json.parse return type is `any` for the same reason;
// values leave this module as `unknown`, which a caller has to narrow before use.

const NOT_IMPLEMENTED = "__NOT_IMPLEMENTED__";

/** The payload as a mapping, empty for anything that is not one. */
export function parse(_text: string): Record<string, unknown> {
  return {};
}

/** One key out of a nested mapping, null when the container is not one. */
export function field(_container: unknown, _key: string): unknown {
  return NOT_IMPLEMENTED;
}

/** Report on both channels: systemMessage reaches the human and additionalContext reaches the
 * agent. Mirrors hook_payload.py's notify. */
export function notify(_message: string, _hookEventName: string = "PostToolUse"): void {}

/** Refuse the call, naming what has to change before it can run. Mirrors hook_payload.py's
 * deny. */
export function deny(_reason: string): void {}

/** The path a Write or Edit call touched, or null for anything else. */
export function editedFile(_text: string): string | null {
  return NOT_IMPLEMENTED;
}
