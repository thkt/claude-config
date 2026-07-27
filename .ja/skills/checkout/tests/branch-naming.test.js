import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "checkout", "SKILL.md"),
  en: join(root, "skills", "checkout", "SKILL.md"),
};
const commits = {
  ja: join(root, ".ja", "skills", "commit", "SKILL.md"),
  en: join(root, "skills", "commit", "SKILL.md"),
};

const prefixes = (doc) =>
  (doc.match(/^\| ([a-z]+)\/ +\|/gm) || []).map((r) => r.match(/[a-z]+/)[0]);

// ブランチの prefix と commit の type は同じ Conventional Commits 由来。片方だけ改名すると、
// 同じ変更が feat/ ブランチの feat commit にならず、履歴の型が割れる。
test("ブランチ prefix が commit の type 表に存在する", () => {
  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${path} が存在する`);
    const found = prefixes(readFileSync(path, "utf8"));
    assert.ok(found.length >= 7, `${lang}: prefix を 7 つ以上読める (${found.join(", ")})`);
    assert.ok(found.includes("feat"), `${lang}: feat/ を使う (feature/ ではない)`);
    const commitDoc = readFileSync(commits[lang], "utf8");
    for (const prefix of found) {
      assert.match(commitDoc, new RegExp(`^\\| ${prefix} `, "m"), `${lang}: commit に ${prefix}`);
    }
  }
});

// ブランチを切る前にステージ済みかどうかは決まっていない。git diff だけだと staged が
// 空に見え、type 判定が git status の porcelain だけに落ちる。
test("変更の読み取りが staged と unstaged の両方を見る", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /`git diff HEAD`/, `${lang}: git diff HEAD で両方を読む`);
    assert.doesNotMatch(
      doc,
      /`git diff` を並列|`git diff` in parallel/,
      `${lang}: 素の diff でない`,
    );
  }
});

// scribe は scribe/<yyyymmdd-HHMMSS> を作る。日付の禁止をリポジトリ全体の規則と読ませない。
test("日付の禁止がこのスキルの作る名前に限定される", () => {
  const scoped = {
    ja: /このスキルが作る名前に日付は入れない/,
    en: /Names this skill creates carry no date/,
  };
  for (const [lang, path] of Object.entries(skills)) {
    assert.match(readFileSync(path, "utf8"), scoped[lang], `${lang}: 主語が限定されている`);
  }
  const scribe = readFileSync(join(root, "skills", "scribe", "SKILL.md"), "utf8");
  assert.match(scribe, /scribe\/<yyyymmdd-HHMMSS>/, "scribe は日付付きの名前を作る");
});
