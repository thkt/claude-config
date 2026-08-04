// hooks/issue-body-template.sh を実 subprocess として起動し、gh issue create の抽出から
// permissionDecision の返却までを固定する。hooks/textlint-lint.sh と同じ形で PreToolUse Bash
// の入力 (stdin JSON) を読み、gh issue create のときだけ title と --body-file の中身を
// skills/issue/scripts/validate-issue-body.py へ渡す。validate-issue-body.py が errors を返した
// ときだけ hookSpecificOutput.permissionDecision を deny で返す (hooks/security/rm-to-trash.sh
// と同じ形)。settings.json への配線はここでは扱わない (Manual verification が担う)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const hook = join(root, "hooks", "issue-body-template.sh");

// gh issue create の --body-file は一時ファイルへ書き出してから渡す。
// skills/issue/tests/validate-issue-body.test.js の runValidate と同じ形。
const withBodyFile = (bodyText, fn) => {
  const dir = mkdtempSync(join(tmpdir(), "issue-body-template-"));
  try {
    const bodyPath = join(dir, "body.md");
    writeFileSync(bodyPath, bodyText, "utf8");
    return fn(bodyPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// hooks/tests/test-textlint-lint.sh の make_bash_json と同じ入力形 ({tool_name, tool_input.command})
// を stdin から渡す。spawnSync の res.error (script 未実装で ENOENT など) はそのまま投げて、
// 「stdout が空」を偽陽性の green にしない。
const runHook = (command) => {
  const input = JSON.stringify({ tool_name: "Bash", tool_input: { command } });
  const res = spawnSync(hook, { input, encoding: "utf8" });
  if (res.error) {
    throw res.error;
  }
  let out = null;
  const stdout = res.stdout ?? "";
  if (stdout.trim()) {
    try {
      out = JSON.parse(stdout);
    } catch {
      out = null;
    }
  }
  return { status: res.status, out, stdout, stderr: res.stderr ?? "" };
};

const validBugBody = [
  "## What & Why",
  "",
  "Login fails for some users.",
  "",
  "## Steps to Reproduce",
  "",
  "1. Open app",
  "2. Log in",
  "",
  "## Expected vs Actual",
  "",
  "- Expected: 200 OK",
  "- Actual: 500 error",
  "",
  "## Scope",
  "",
  "- In scope: login flow",
  "- Out of scope: signup flow",
  "",
].join("\n");

// bug.md の必須節から "Expected vs Actual" を欠かせた本文。
const missingSectionBugBody = [
  "## What & Why",
  "",
  "Login fails for some users.",
  "",
  "## Steps to Reproduce",
  "",
  "1. Open app",
  "2. Log in",
  "",
  "## Scope",
  "",
  "- In scope: login flow",
  "- Out of scope: signup flow",
  "",
].join("\n");

test("T-005 gh issue create 以外の Bash コマンドでは何も返さず素通しする", () => {
  const { stdout } = runHook("gh issue list");
  assert.equal(
    stdout.trim(),
    "",
    `gh issue create 以外は無出力で終わる (実際: ${JSON.stringify(stdout)})`,
  );
});

test("T-006 タイトルに型プレフィックスが無い起票は理由を残して素通しする", () => {
  withBodyFile(validBugBody, (bodyPath) => {
    const cmd = `gh issue create --title "Login fails for some users" --body-file ${bodyPath}`;
    const { out, stdout } = runHook(cmd);
    assert.ok(out, `stdout が JSON として parse できる (実際: ${JSON.stringify(stdout)})`);
    assert.notEqual(
      out?.hookSpecificOutput?.permissionDecision,
      "deny",
      "型プレフィックスが無いだけでは deny しない",
    );
    assert.ok(
      stdout.includes("型プレフィックス"),
      `理由に型プレフィックスが無い旨が残る (実際: ${JSON.stringify(stdout)})`,
    );
  });
});

test("T-007 本文が --body でインライン指定された起票は理由を残して素通しする", () => {
  const cmd =
    'gh issue create --title "[Bug] Login fails for some users" --body "Login fails for some users."';
  const { out, stdout } = runHook(cmd);
  assert.ok(out, `stdout が JSON として parse できる (実際: ${JSON.stringify(stdout)})`);
  assert.notEqual(
    out?.hookSpecificOutput?.permissionDecision,
    "deny",
    "--body のインライン指定だけでは deny しない",
  );
  assert.ok(
    stdout.includes("--body-file"),
    `理由に --body-file を使う旨が残る (実際: ${JSON.stringify(stdout)})`,
  );
});

test("T-008 骨格の必須節を欠く本文の起票に permissionDecision deny を返す", () => {
  withBodyFile(missingSectionBugBody, (bodyPath) => {
    const cmd = `gh issue create --title "[Bug] Login fails for some users" --body-file ${bodyPath}`;
    const { out, stdout } = runHook(cmd);
    assert.ok(out, `stdout が JSON として parse できる (実際: ${JSON.stringify(stdout)})`);
    assert.equal(
      out?.hookSpecificOutput?.hookEventName,
      "PreToolUse",
      `hookSpecificOutput.hookEventName は PreToolUse (実際: ${JSON.stringify(stdout)})`,
    );
    assert.equal(
      out?.hookSpecificOutput?.permissionDecision,
      "deny",
      `errors があるときは deny を返す (実際: ${JSON.stringify(stdout)})`,
    );
    assert.ok(
      out?.hookSpecificOutput?.permissionDecisionReason?.includes(
        "missing_section:Expected vs Actual",
      ),
      `permissionDecisionReason に missing_section:Expected vs Actual が載る (実際: ${JSON.stringify(stdout)})`,
    );
  });
});

// bug.md の必須節 (What & Why / Steps to Reproduce / Expected vs Actual / Scope) の代わりに
// feature.md の節構成 (What & Why / Acceptance Criteria / Scope / Testing Decisions) を持つ本文。
const featureShapedBody = [
  "## What & Why",
  "",
  "Add CSV export so users can analyze offline.",
  "",
  "## Acceptance Criteria",
  "",
  "- [ ] When user clicks Export, a .csv downloads",
  "",
  "## Scope",
  "",
  "- In scope: export flow",
  "- Out of scope: import flow",
  "",
  "## Testing Decisions",
  "",
  "- Test the CSV serializer",
  "",
].join("\n");

test("T-009 Bug のタイトルで feature の節構成を持つ本文を起票しようとすると deny が返る", () => {
  withBodyFile(featureShapedBody, (bodyPath) => {
    const cmd = `gh issue create --title "[Bug] Login fails for some users" --body-file ${bodyPath}`;
    const { out, stdout } = runHook(cmd);
    assert.ok(out, `stdout が JSON として parse できる (実際: ${JSON.stringify(stdout)})`);
    assert.equal(
      out?.hookSpecificOutput?.permissionDecision,
      "deny",
      `タイトルが Bug でも本文が feature の節構成だと deny を返す (実際: ${JSON.stringify(stdout)})`,
    );
  });
});

test("T-010 タイトルの型が指す骨格に沿う本文の起票は deny されずに通る", () => {
  withBodyFile(validBugBody, (bodyPath) => {
    const cmd = `gh issue create --title "[Bug] Login fails for some users" --body-file ${bodyPath}`;
    const { out, stdout, status } = runHook(cmd);
    assert.equal(
      status,
      0,
      `骨格に沿う本文の起票では hook が exit 0 で終わる (実際: ${JSON.stringify(stdout)})`,
    );
    assert.notEqual(
      out?.hookSpecificOutput?.permissionDecision,
      "deny",
      `タイトルの型が指す骨格に沿う本文は deny されない (実際: ${JSON.stringify(stdout)})`,
    );
  });
});
