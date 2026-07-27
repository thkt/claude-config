import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "commit", "SKILL.md"),
  en: join(root, "skills", "commit", "SKILL.md"),
};

// Conventional Commits の type。表から 1 つ落ちると、その変更に当てはまる型が無くなり
// haiku が近い型へ寄せる。semver に効く feat / fix が巻き込まれると release 判断が狂う。
const TYPES = ["feat", "fix", "refactor", "docs", "test", "chore", "perf", "style", "ci"];

test("type の一覧が両言語で揃う", () => {
  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${path} が存在する`);
    const doc = readFileSync(path, "utf8");
    for (const type of TYPES) {
      assert.match(doc, new RegExp(`^\\| ${type} `, "m"), `${lang}: ${type} の行`);
    }
    const rows = doc.match(/^\| (feat|fix|refactor|docs|test|chore|perf|style|ci) /gm) || [];
    assert.equal(rows.length, TYPES.length, `${lang}: 型の行数が ${TYPES.length}`);
  }
});

// 判別できないときの既定値。feat は semver minor を上げる宣言なので、根拠なしに選ぶと
// リリース判断を誤らせる。文言でなく既定値そのものを取り出して判定する。
test("判別不能時の既定 type が feat でない", () => {
  const fallback = {
    ja: /判別できないときは (\w+) とする/,
    en: /When it cannot be told, use (\w+)\./,
  };
  for (const [lang, path] of Object.entries(skills)) {
    const found = readFileSync(path, "utf8").match(fallback[lang]);
    assert.ok(found, `${lang}: 既定 type を読み取れる`);
    assert.notEqual(found[1], "feat", `${lang}: 既定が feat ではない`);
    assert.ok(TYPES.includes(found[1]), `${lang}: 既定 ${found[1]} が型の一覧にある`);
  }
});

// 一時ファイルの置き場。/tmp 直書きは sandbox の許可範囲に依存するので、$TMPDIR で受ける。
test("sandbox 互換コミットが $TMPDIR を使う", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const block = doc.slice(doc.indexOf("```bash"), doc.indexOf("```", doc.indexOf("```bash") + 3));
    assert.match(block, /\$TMPDIR/, `${lang}: 一時ファイルが $TMPDIR 配下`);
    assert.doesNotMatch(block, /\/tmp\/claude/, `${lang}: /tmp の直書きが残っていない`);
    // rm は hook が拒む。~/.Trash への mv で後始末する。
    assert.match(block, /mv .* ~\/\.Trash\//, `${lang}: 後始末が mv`);
    assert.doesNotMatch(block, /\brm\b/, `${lang}: rm を使わない`);
  }
});

// 誤ったリポジトリへのコミットは取り返しがつかない。code workflow が per-unit commit で
// 使うガードと同じコマンドで、手動コミット経路にも同じ確認を置く。
test("commit 前にリポジトリを確かめる", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const block = doc.slice(doc.indexOf("```bash"), doc.indexOf("```", doc.indexOf("```bash") + 3));
    const guard = block.indexOf("git rev-parse --show-toplevel");
    const commit = block.indexOf("git commit -F");
    assert.ok(guard >= 0, `${lang}: repo guard がある`);
    assert.ok(guard < commit, `${lang}: guard が commit より前`);
  }
  assert.match(
    readFileSync(join(root, "workflows", "code.js"), "utf8"),
    /git rev-parse --show-toplevel/,
    "code workflow も同じコマンドで確かめる",
  );
});

// allowed-tools は事前承認の列挙。手順が使うコマンドが漏れると、実行時に確認が挟まる。
test("allowed-tools が手順の使うコマンドを網羅する", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const frontmatter = readFileSync(path, "utf8").split("---")[1];
    for (const grant of ["Bash(git:*)", "Bash(cat:*)", "Bash(mv:*)"]) {
      assert.ok(frontmatter.includes(grant), `${lang}: ${grant} を許可する`);
    }
  }
});
