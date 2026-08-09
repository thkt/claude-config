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
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
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
  // 2 件目は起票でなく、引数の中に同じ語を持つだけのコマンド。このリポジトリの
  // コミット e7db3385 が実際にこの subject を持つ。
  // 3 件目は同じ語が本文の行頭に来る commit message。引用の内側の改行までコマンドの
  // 区切りとして数えると、この行が起票と見分けられなくなる。
  const passThrough = [
    "gh issue list",
    'git commit -m "fix: gh issue create hook"',
    [
      "git commit -m 'fix(hooks): stop a filing that skips the skeleton",
      "",
      'gh issue create --title "[Bug] x" --body-file /nonexistent/body.md now denies\'',
    ].join("\n"),
  ];
  for (const cmd of passThrough) {
    const { stdout } = runHook(cmd);
    assert.equal(
      stdout.trim(),
      "",
      `gh issue create 以外は無出力で終わる (${cmd} で実際: ${JSON.stringify(stdout)})`,
    );
  }
});

test("T-006 タイトルに型プレフィックスが無い起票は骨格を特定できず deny する", () => {
  withBodyFile(validBugBody, (bodyPath) => {
    const cmd = `gh issue create --title "Login fails for some users" --body-file ${bodyPath}`;
    const { out, stdout } = runHook(cmd);
    assert.ok(out, `stdout が JSON として parse できる (実際: ${JSON.stringify(stdout)})`);
    assert.equal(
      out?.hookSpecificOutput?.permissionDecision,
      "deny",
      `型が無いと骨格を選べないので deny を返す (実際: ${JSON.stringify(stdout)})`,
    );
    assert.equal(
      out?.decision,
      undefined,
      `top-level decision は返さない (実際: ${JSON.stringify(stdout)})`,
    );
    assert.ok(
      stdout.includes("型プレフィックス"),
      `理由に型プレフィックスが無い旨が残る (実際: ${JSON.stringify(stdout)})`,
    );
  });
});

test("T-007 本文が --body でインライン指定された起票は deny する", () => {
  const cmd =
    'gh issue create --title "[Bug] Login fails for some users" --body "Login fails for some users."';
  const { out, stdout } = runHook(cmd);
  assert.ok(out, `stdout が JSON として parse できる (実際: ${JSON.stringify(stdout)})`);
  assert.equal(
    out?.hookSpecificOutput?.permissionDecision,
    "deny",
    `インライン本文は骨格と照合できないので deny を返す (実際: ${JSON.stringify(stdout)})`,
  );
  assert.equal(
    out?.decision,
    undefined,
    `top-level decision は返さない (実際: ${JSON.stringify(stdout)})`,
  );
  assert.ok(
    stdout.includes("--body-file"),
    `理由に --body-file を使う旨が残る (実際: ${JSON.stringify(stdout)})`,
  );
});

test("T-008 骨格の必須節を欠く本文の起票に permissionDecision deny を返す", () => {
  withBodyFile(missingSectionBugBody, (bodyPath) => {
    // cd で一時ディレクトリを指すのは、hook がリポジトリ独自テンプレートを先に探すため。
    // 指さないと実行時の cwd が読まれ、このリポジトリの .github/ISSUE_TEMPLATE が骨格に
    // なって、skill 直下の templates/bug.md を見るこの test の前提が崩れる。
    const cmd = `cd ${dirname(bodyPath)} && gh issue create --title "[Bug] Login fails for some users" --body-file ${bodyPath}`;
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
    // cd で一時ディレクトリを指すのは、hook がリポジトリ独自テンプレートを先に探すため。
    // 指さないと実行時の cwd が読まれ、このリポジトリの .github/ISSUE_TEMPLATE が骨格に
    // なって、skill 直下の templates/bug.md を見るこの test の前提が崩れる。
    const cmd = `cd ${dirname(bodyPath)} && gh issue create --title "[Bug] Login fails for some users" --body-file ${bodyPath}`;
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
    // cd で一時ディレクトリを指すのは、hook がリポジトリ独自テンプレートを先に探すため。
    // 指さないと実行時の cwd が読まれ、このリポジトリの .github/ISSUE_TEMPLATE が骨格に
    // なって、skill 直下の templates/bug.md を見るこの test の前提が崩れる。
    const cmd = `cd ${dirname(bodyPath)} && gh issue create --title "[Bug] Login fails for some users" --body-file ${bodyPath}`;
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

test("T-013 変数代入を別行に置いた起票でも骨格を欠く本文なら deny が返る", () => {
  withBodyFile(missingSectionBugBody, (bodyPath) => {
    // 起票を書くとき、一時ファイルのパスは変数へ代入してから使うのが自然な形になる。
    // その代入は改行で区切られ `gh issue create` は先頭行から外れるので、行を分けた
    // この形が実際に走る形になる。単一行の T-008 では通り抜ける。
    const cmd = [
      `cd ${dirname(bodyPath)}`,
      `B=${bodyPath}`,
      'gh issue create --title "[Bug] Login fails for some users" --body-file "$B"',
    ].join("\n");
    const { out, stdout } = runHook(cmd);
    assert.ok(out, `stdout が JSON として parse できる (実際: ${JSON.stringify(stdout)})`);
    assert.equal(
      out?.hookSpecificOutput?.permissionDecision,
      "deny",
      `gh issue create が先頭行でなくても deny を返す (実際: ${JSON.stringify(stdout)})`,
    );
  });
});

test("T-014 --body-file の指す先が読めない起票は deny する", () => {
  // hook はシェルの状態を持たないので `$B` を展開できない。展開できないまま素通しすると
  // 起票の本文を一度も読まずに通すことになるので、読めないパスは止める側へ倒す。
  const cmd = 'gh issue create --title "[Bug] Login fails" --body-file "$B"';
  const { out, stdout } = runHook(cmd);
  assert.ok(out, `stdout が JSON として parse できる (実際: ${JSON.stringify(stdout)})`);
  assert.equal(
    out?.hookSpecificOutput?.permissionDecision,
    "deny",
    `読めないパスの起票は deny を返す (実際: ${JSON.stringify(stdout)})`,
  );
  assert.ok(
    stdout.includes("--body-file"),
    `理由に --body-file の指す先が読めない旨が残る (実際: ${JSON.stringify(stdout)})`,
  );
});

test("T-015 コマンドを分割できないときは骨格に沿う本文でも起票を deny する", () => {
  const dir = mkdtempSync(join(tmpdir(), "issue-body-split-"));
  try {
    // 分割が失われると、どの断片が起票なのかを決められないまま本文を一度も読まずに通す
    // ことになる。その状態を、複製の分割呼び出しを存在しないコマンドへ差し替えて作る。
    const broken = join(dir, "broken.sh");
    const prepared = spawnSync("sh", [
      "-c",
      `sed "s/python3 -c/nonexistent-python3 -c/" ${hook} > ${broken} && chmod +x ${broken}`,
    ]);
    assert.equal(prepared.status, 0, `複製の用意が成功する (実際: ${prepared.stderr})`);

    const bodyPath = join(dir, "body.md");
    writeFileSync(bodyPath, validBugBody, "utf8");
    const command = `cd ${dir} && gh issue create --title "[Bug] Login fails for some users" --body-file ${bodyPath}`;
    const res = spawnSync(broken, {
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
      encoding: "utf8",
    });
    const stdout = res.stdout ?? "";
    assert.match(
      stdout,
      /"permissionDecision":"deny"/,
      `分割できないときは deny を返す (実際: ${JSON.stringify(stdout)})`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("T-024 heredoc の本文に起票コマンドの語があっても deny しない", () => {
  // コミットメッセージを heredoc で渡すと本文の各行がコマンド列として走査され、
  // 行頭が gh issue create になる行を持つ git commit が止められていた。
  const command = [
    "cat > /tmp/claude/msg.txt << 'EOF'",
    "fix(hooks): 何かを直す",
    "",
    "gh issue create --title x を本文で説明している行",
    "EOF",
    "git commit -F /tmp/claude/msg.txt",
  ].join("\n");
  const { stdout } = runHook(command);
  assert.equal(
    stdout.trim(),
    "",
    `heredoc 本文の起票語では何も返さない (実際: ${JSON.stringify(stdout)})`,
  );
});

test("T-016 骨格の無い型のタイトルは照合できないため deny する", () => {
  const dir = mkdtempSync(join(tmpdir(), "issue-body-notemplate-"));
  try {
    // spike は .github/ISSUE_TEMPLATE/ にも skills/issue/templates/ にも骨格を持たない型。
    const bodyPath = join(dir, "body.md");
    writeFileSync(bodyPath, "## Nonsense\n\nx\n", "utf8");
    const cmd = `cd ${dir} && gh issue create --title "[Spike] 骨格を持たない型" --body-file ${bodyPath}`;
    const { out, stdout } = runHook(cmd);
    assert.ok(out, `stdout が JSON として parse できる (実際: ${JSON.stringify(stdout)})`);
    assert.equal(
      out?.hookSpecificOutput?.permissionDecision,
      "deny",
      `骨格を持たない型の起票は deny を返す (実際: ${JSON.stringify(stdout)})`,
    );
    assert.ok(
      stdout.includes("spike"),
      `理由に骨格の無い型名が載る (実際: ${JSON.stringify(stdout)})`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("T-017 validator を実行できないときは骨格に沿う本文でも deny する", () => {
  const dir = mkdtempSync(join(tmpdir(), "issue-body-validator-"));
  try {
    // hook は自身の位置からの相対で骨格と validator を探す。複製を hooks/ に置き隣に骨格を
    // 置くと、骨格の探索を通り抜けて validator の実行だけが失敗する状態になる。
    const broken = join(dir, "hooks", "broken.sh");
    const prepared = spawnSync("sh", [
      "-c",
      [
        `mkdir -p ${join(dir, "hooks")} ${join(dir, "skills", "issue", "templates")}`,
        `cp ${join(root, "skills", "issue", "templates", "bug.md")} ${join(dir, "skills", "issue", "templates")}/`,
        `sed 's#^VALIDATOR=.*#VALIDATOR="/nonexistent/validate-issue-body.py"#' ${hook} > ${broken}`,
        `chmod +x ${broken}`,
      ].join(" && "),
    ]);
    assert.equal(prepared.status, 0, `複製の用意が成功する (実際: ${prepared.stderr})`);

    const bodyPath = join(dir, "body.md");
    writeFileSync(bodyPath, validBugBody, "utf8");
    const command = `cd ${dir} && gh issue create --title "[Bug] Login fails for some users" --body-file ${bodyPath}`;
    const res = spawnSync(broken, {
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
      encoding: "utf8",
    });
    const stdout = res.stdout ?? "";
    assert.match(
      stdout,
      /"permissionDecision":"deny"/,
      `validator を実行できないときは deny を返す (実際: ${JSON.stringify(stdout)})`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("T-012 リポジトリに issue form があるとき、skill 直下でなくその form の label が骨格になる", () => {
  const dir = mkdtempSync(join(tmpdir(), "issue-body-form-"));
  try {
    const formDir = join(dir, ".github", "ISSUE_TEMPLATE");
    mkdirSync(formDir, { recursive: true });
    writeFileSync(
      join(formDir, "bug.yml"),
      [
        "name: Bug report",
        "body:",
        "  - type: markdown",
        "    attributes:",
        "      value: Thanks for filing",
        "  - type: input",
        "    attributes:",
        "      label: Impact",
        "    validations:",
        "      required: true",
        "",
      ].join("\n"),
      "utf8",
    );
    // form の label だけを持ち、skill 直下 templates/bug.md の必須節 (What & Why ほか) は
    // 1 つも持たない本文。form が骨格に選ばれていなければ missing_section で deny される。
    const bodyPath = join(dir, "body.md");
    writeFileSync(bodyPath, "## Impact\n\nLogin is down for everyone.\n", "utf8");

    const cmd = `cd ${dir} && gh issue create --title "[Bug] Login is down" --body-file ${bodyPath}`;
    const { out, stdout, status } = runHook(cmd);
    assert.equal(status, 0, `form の label に沿う本文で hook が exit 0 で終わる (実際: ${stdout})`);
    assert.notEqual(
      out?.hookSpecificOutput?.permissionDecision,
      "deny",
      `form の label に沿う本文は deny されない (実際: ${JSON.stringify(stdout)})`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
