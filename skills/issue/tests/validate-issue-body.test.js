// skills/issue/scripts/validate-issue-body.py を実 subprocess として起動し、CLI 契約
// (引数 -> stdout JSON -> exit code) を固定する。workflows/audit/tests/audit.seam.test.js と
// 同じく実スクリプトを spawnSync で通し、python の test discover には乗せない。
//
// CLI 契約 (validate-outcome.py の def section_body と同じ形で節を切り出す):
//   Usage: validate-issue-body.py <template-file> <title> <body-file>
//   stdout: JSON { errors, warnings, checks }
//   exit: 0 if no errors (warnings allowed), 1 if errors
//
// 骨格は <template-file> の "## Template" 見出し配下、最初のコードブロックから読む。
// "## Template" と "## Guidelines" 自体は骨格に含めない。見出し末尾が "(optional)" の節は
// 任意節として missing_section の対象から外す。照合は集合で行い、本文側の節の並び順は見ない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const script = join(root, "skills", "issue", "scripts", "validate-issue-body.py");
const bugTemplate = join(root, "skills", "issue", "templates", "bug.md");
const choreTemplate = join(root, "skills", "issue", "templates", "chore.md");
const featureTemplate = join(root, "skills", "issue", "templates", "feature.md");

// 本文は一時ファイルへ書き出してから渡す。validate-outcome.py 側もファイルパス引数なので、
// 呼び出し側 (/issue の Phase 4 検証) が渡す実際の形に揃える。
const runValidate = (templatePath, title, bodyText) => {
  const dir = mkdtempSync(join(tmpdir(), "validate-issue-body-"));
  try {
    const bodyPath = join(dir, "body.md");
    writeFileSync(bodyPath, bodyText, "utf8");
    const res = spawnSync("python3", [script, templatePath, title, bodyPath], {
      encoding: "utf8",
    });
    let out;
    try {
      out = JSON.parse(res.stdout);
    } catch {
      out = null;
    }
    return { status: res.status, out, stderr: res.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("T-001 骨格の必須節が本文に無いとき missing_section をその節名つきで返す", () => {
  const body = [
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
  const { status, out } = runValidate(bugTemplate, "[Bug] Login fails for some users", body);
  assert.ok(out, "stdout が JSON として parse できる");
  assert.equal(status, 1, "errors がある run は exit 1 で終わる");
  assert.ok(
    out.errors.includes("missing_section:Expected vs Actual"),
    `errors に missing_section:Expected vs Actual が節名つきで載る (実際: ${JSON.stringify(out.errors)})`,
  );
});

test("T-002 骨格に無い Plan と Backlog candidates は errors にならない", () => {
  const body = [
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
    "## Plan",
    "",
    "- Step 1",
    "",
    "## Backlog candidates",
    "",
    "- Follow-up idea",
    "",
  ].join("\n");
  const { status, out } = runValidate(bugTemplate, "[Bug] Login fails for some users", body);
  assert.ok(out, "stdout が JSON として parse できる");
  assert.equal(status, 0, "骨格の必須節が揃っていれば exit 0 で終わる");
  assert.deepEqual(
    out.errors,
    [],
    `骨格に無い Plan / Backlog candidates は errors に載らない (実際: ${JSON.stringify(out.errors)})`,
  );
});

test("T-003 タイトルの型と渡したテンプレートが食い違うとき type_mismatch を返す", () => {
  const body = [
    "## What & Why",
    "",
    "Login fails for some users.",
    "",
    "## Acceptance Criteria",
    "",
    "- [ ] When user logs in, session persists",
    "",
    "## Scope",
    "",
    "- In scope: login flow",
    "- Out of scope: signup flow",
    "",
    "## Testing Decisions",
    "",
    "- Cover the session persistence path",
    "",
  ].join("\n");
  // title は [Bug] だが渡したテンプレートは feature.md なので型が食い違う。
  const { status, out } = runValidate(featureTemplate, "[Bug] Login fails for some users", body);
  assert.ok(out, "stdout が JSON として parse できる");
  assert.equal(status, 1, "type_mismatch がある run は exit 1 で終わる");
  assert.ok(
    out.errors.some((e) => e.startsWith("type_mismatch:")),
    `errors に type_mismatch が載る (実際: ${JSON.stringify(out.errors)})`,
  );
});

test("T-004 本文の節の並びが骨格と違っても errors にならない", () => {
  const body = [
    "## Scope",
    "",
    "- In scope: dependency bump",
    "- Out of scope: unrelated refactor",
    "",
    "## Changes",
    "",
    "- Update package.json",
    "",
    "## What & Why",
    "",
    "Bump the dependency to close a known issue.",
    "",
  ].join("\n");
  const { status, out } = runValidate(choreTemplate, "[Chore] Bump dependency", body);
  assert.ok(out, "stdout が JSON として parse できる");
  assert.equal(status, 0, "節の並びが骨格と違っても揃っていれば exit 0 で終わる");
  assert.deepEqual(
    out.errors,
    [],
    `並び順の違いは errors にならない (実際: ${JSON.stringify(out.errors)})`,
  );
});
