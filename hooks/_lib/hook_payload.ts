/// <reference types="node" />
// Typed reads of a hook payload, and the one write a PreToolUse hook makes. The TypeScript
// side of hooks/_lib/hook_payload.py; both stay in the tree while the consumers move over one
// at a time, and hooks/_lib/tests/hook-payload-parity.test.ts holds the two to the same answers.
//
// JSON.parse returns `any`, and a `typeof x === "object"` check narrows only to `object`, so a
// field read straight from the payload spreads that looseness through every caller a type
// checker follows. This module is the one place that admits it. Values leave here as
// `unknown`, which a caller has to narrow before using -- the same contract hook_payload.py's
// docstring states for `object`.

/** A JSON object, or null for an array, a scalar, or null itself. */
function mapping(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** The payload as a mapping, empty for anything that is not one. */
export function parse(text: string): Record<string, unknown> {
  let loaded: unknown;
  try {
    loaded = JSON.parse(text || "{}");
  } catch {
    return {};
  }
  return mapping(loaded) ?? {};
}

/** One key out of a nested mapping, null when the container is not one.
 *
 * Null rather than undefined for an absent key: the Python side returns None there, and a
 * differential test comparing the two under strict equality separates the two values. */
export function field(container: unknown, key: string): unknown {
  const found = mapping(container);
  if (found === null) {
    return null;
  }
  return Object.hasOwn(found, key) ? found[key] : null;
}

/** The envelope notify writes. Split from the write so a test reads the shape without
 * capturing stdout, the way gate.ts keeps classifyObservation apart from the stdout write. */
export function notification(message: string, hookEventName: string): Record<string, unknown> {
  return {
    systemMessage: message,
    hookSpecificOutput: { hookEventName, additionalContext: message },
  };
}

/** Report on both channels: systemMessage reaches the human and additionalContext reaches the
 * agent, so a hook that only picks one leaves the other side unable to act on what it found.
 *
 * hookEventName defaults to PostToolUse, this module's first caller. The hooks reference
 * requires hookSpecificOutput.hookEventName to name the event actually firing
 * (https://code.claude.com/docs/en/hooks#json-output, "It requires a hookEventName field set
 * to the event name."), so a hook of a different kind, such as a PreToolUse advisory, passes
 * its own. */
export function notify(message: string, hookEventName: string = "PostToolUse"): void {
  process.stdout.write(`${JSON.stringify(notification(message, hookEventName))}\n`);
}

/** The envelope deny writes. Split from the write for the same reason notification is. */
export function denial(reason: string): Record<string, unknown> {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

/** Refuse the call, naming what has to change before it can run.
 *
 * The envelope is the PreToolUse contract, so every hook that stops a call emits the same
 * shape. What differs between them is the reason, which the caller writes.
 *
 * Not a top-level `decision`: PreToolUse accepts only "block" there, so an "approve" written
 * at that level asserts a permission the harness never grants.
 *
 * permissionDecision takes exactly these: allow, deny, ask, defer. Any other value fails
 * schema validation, which Claude Code reports as a non-blocking hook error before the tool
 * call runs, so a gate written with an invalid value stops nothing and says nothing. */
export function deny(reason: string): void {
  process.stdout.write(`${JSON.stringify(denial(reason))}\n`);
}

const EDITING_TOOLS = new Set(["Write", "Edit"]);

/** The path a Write or Edit call touched, or null for anything else. */
export function editedFile(text: string): string | null {
  const payload = parse(text);
  const toolName = payload.tool_name;
  if (typeof toolName !== "string" || !EDITING_TOOLS.has(toolName)) {
    return null;
  }
  const path = field(payload.tool_input, "file_path");
  return typeof path === "string" && path ? path : null;
}
