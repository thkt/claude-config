// These pin that the globals the production sandbox lacks are missing in the same shape from a
// test run. Loosening this returns the state where a script that dies in production passes under
// test. The list of what is supplied and what is sealed off lives in
// rules/conventions/WORKFLOWS.md under Script evaluation form.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PRODUCTION_GLOBALS, SCRIPT_ERROR_KEYS, runWorkflow } from "../run-workflow.js";

// runWorkflow's contract reads the source from a file path (readFileSync), so the script body is
// written to a temporary file first. Each test uses its own temporary directory so script files
// never collide between tests.
const withScript = async (source, run) => {
  const dir = mkdtempSync(join(tmpdir(), "run-workflow-test-"));
  const path = join(dir, "script.js");
  writeFileSync(path, source);
  try {
    return await run(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("T-004 a script referencing crypto dies with a ReferenceError", async () => {
  await withScript("return crypto.randomUUID();", async (path) => {
    await assert.rejects(
      () => runWorkflow(path, {}),
      (err) => {
        assert.ok(err instanceof ReferenceError, "it dies with a ReferenceError");
        assert.match(err.message, /crypto is not defined/);
        return true;
      },
    );
  });
});

test("T-005 a script referencing fetch, process, or Buffer dies the same way", async () => {
  const cases = [
    { name: "fetch", source: "return fetch('https://example.com');" },
    { name: "process", source: "return process.version;" },
    { name: "Buffer", source: "return Buffer.from('x');" },
  ];
  for (const { name, source } of cases) {
    await withScript(source, async (path) => {
      await assert.rejects(
        () => runWorkflow(path, {}),
        (err) => {
          assert.ok(err instanceof ReferenceError, `${name} dies with a ReferenceError`);
          assert.match(err.message, new RegExp(`${name} is not defined`));
          return true;
        },
      );
    });
  }
});

test("T-006 a script calling Date.now dies with an Error citing resume as the reason", async () => {
  await withScript("return Date.now();", async (path) => {
    await assert.rejects(
      () => runWorkflow(path, {}),
      (err) => {
        // A partial match would still pass after the harness swapped in its own phrasing, so this
        // matches the production message itself.
        assert.equal(
          err.message,
          "Date.now() / new Date() are unavailable in workflow scripts (breaks resume). Stamp results after the workflow returns, or pass timestamps via args.",
          "it dies with the same message as the production sandbox",
        );
        return true;
      },
    );
  });
});

test("T-007 new Date with arguments and Math.floor return values without dying", async () => {
  await withScript(
    "return { time: new Date(0).getTime(), floor: Math.floor(3.7) };",
    async (path) => {
      const { result } = await runWorkflow(path, {});
      assert.equal(result.time, 0, "new Date(0) returns the 1970-01-01 epoch without dying");
      assert.equal(result.floor, 3, "Math.floor returns the truncated value without dying");
    },
  );
});

test("T-008 a Map, Set, Date, or RegExp placed in the return value becomes an empty object, as production's JSON conversion does", async () => {
  await withScript(
    "return { map: new Map([['k', 'v']]), set: new Set([1]), date: new Date(0), re: /x/g, plain: { a: 1 }, arr: [1, 2] };",
    async (path) => {
      const { result } = await runWorkflow(path, {});
      assert.deepEqual(result.map, {}, "a Map arrives as an empty object, as in production");
      assert.deepEqual(result.set, {}, "a Set arrives as an empty object, as in production");
      assert.deepEqual(result.date, {}, "a Date arrives as an empty object, as in production");
      assert.deepEqual(result.re, {}, "a RegExp arrives as an empty object, as in production");
      assert.deepEqual(result.plain, { a: 1 }, "a plain object arrives with its contents intact");
      assert.deepEqual(result.arr, [1, 2], "an array arrives with its contents intact");
    },
  );
});

// Adding a name to the list does not create the injection, so this goes red until the supply is
// written too. console alone spins idle, since an ambient vm value returns an object for it, and
// T-011 guards what it actually does.
test("T-009 the globals production supplies are reachable from the harness too", async () => {
  for (const name of PRODUCTION_GLOBALS) {
    await withScript(`return typeof ${name};`, async (path) => {
      const { result } = await runWorkflow(path, {});
      assert.notEqual(result, "undefined", `${name} is supplied`);
    });
  }
});

// This stops a script branching on budget.total from taking a different branch under test alone.
test("T-010 budget returns the state of a run with no target set", async () => {
  await withScript(
    "return { total: budget.total, spent: budget.spent(), remaining: budget.remaining() };",
    async (path) => {
      const { result } = await runWorkflow(path, {});
      assert.equal(result.total, null, "with no target set, total is null");
      assert.equal(result.spent, 0, "nothing is spent yet");
      assert.equal(result.remaining, Infinity, "with total null, remaining is Infinity");
    },
  );
});

// Left as the ambient vm console, the output would appear nowhere and the test would still pass.
test("T-011 console output reaches logs, and warn and error carry a prefix", async () => {
  await withScript(
    "console.log('plain', { a: 1 }); console.warn('careful'); console.error('broken'); return 1;",
    async (path) => {
      const { logs } = await runWorkflow(path, {});
      assert.deepEqual(logs, ['plain {"a":1}', "[warn] careful", "[error] broken"]);
    },
  );
});

test("T-012 setTimeout resumes after waiting, and clearTimeout cancels that resumption", async () => {
  await withScript(
    "const fired = await new Promise((r) => { setTimeout(() => r('fired'), 0); });" +
      "const canceled = await new Promise((r) => { const id = setTimeout(() => r('fired'), 0); clearTimeout(id); setTimeout(() => r('canceled'), 0); });" +
      "return { fired, canceled };",
    async (path) => {
      const { result } = await runWorkflow(path, {});
      assert.equal(result.fired, "fired", "the setTimeout callback runs");
      assert.equal(result.canceled, "canceled", "the cleared callback does not run");
    },
  );
});

// Nothing pinned parallel against the contract, so it drifted to Promise.all and rejected (#434).
test("T-013 a parallel whose thunk throws resolves rather than rejecting", async () => {
  const source = `
    const out = await parallel([() => 1, () => { throw new Error("boom"); }, () => 3]);
    return { out };
  `;
  await withScript(source, async (path) => {
    const { result } = await runWorkflow(path, { args: { repo: "/abs/target-repo" } });
    assert.deepEqual(result.out, [1, null, 3], "the throwing thunk leaves null at its own index");
  });
});

// The contract draws no line between a throw and a returned rejection.
test("T-014 a parallel whose thunk returns a rejected promise leaves null at that index", async () => {
  const source = `
    const out = await parallel([() => Promise.reject(new Error("boom")), () => 2]);
    return { out };
  `;
  await withScript(source, async (path) => {
    const { result } = await runWorkflow(path, { args: { repo: "/abs/target-repo" } });
    assert.deepEqual(result.out, [null, 2]);
  });
});

// A stub that throws is the harness's only host-origin error path, and production hands such an
// error to the script as a null-prototype object carrying SCRIPT_ERROR_KEYS and nothing else.
test("T-015 an error the harness throws into the script arrives in production's shape", async () => {
  const source = `
    try {
      await agent("x");
      return { caught: false };
    } catch (e) {
      return {
        caught: true,
        keys: Object.keys(e),
        isError: e instanceof Error,
        prototypeIsNull: Object.getPrototypeOf(e) === null,
        stringified: e.toString(),
        name: e.name,
        message: e.message,
        hasCause: "cause" in e,
        code: e.code ?? null,
      };
    }
  `;
  await withScript(source, async (path) => {
    const { result } = await runWorkflow(path, {
      stubs: {
        agent: () => {
          const err = new TypeError("stub-failed", { cause: new RangeError("root") });
          err.code = "E_CUSTOM";
          throw err;
        },
      },
    });
    assert.equal(result.caught, true, "the throw reaches the script");
    assert.deepEqual(result.keys, SCRIPT_ERROR_KEYS, "the own properties are the supplied list");
    assert.equal(result.isError, false, "instanceof Error is false, as in production");
    assert.equal(result.prototypeIsNull, true);
    assert.equal(result.name, "TypeError", "the name crosses");
    assert.equal(result.message, "stub-failed");
    assert.equal(result.stringified, "TypeError: stub-failed");
    assert.equal(result.hasCause, false, "cause does not cross, as in production");
    assert.equal(result.code, null, "a custom property does not cross, as in production");
  });
});
