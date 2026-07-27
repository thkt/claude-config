import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

// build に issue を渡す案内。日本語と英語の両方の言い回しを拾う。
const HANDOFF =
  /build workflow に|build に渡|build に委譲|build へ|to the build workflow|delegate to build/;
// qualify は verdict 表で Plan 節の有無を先に分岐し、build-ready の行にたどり着く
// 時点で Plan 節の存在が確定している。
const EXEMPT = new Set(["qualify"]);

const skillDocs = () => {
  const docs = [];
  for (const prefix of ["", ".ja"]) {
    const base = join(root, prefix, "skills");
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || EXEMPT.has(entry.name)) continue;
      const path = join(base, entry.name, "SKILL.md");
      if (existsSync(path)) docs.push({ lang: prefix || "en", name: entry.name, path });
    }
  }
  return docs;
};

// build は ## Plan 節の無い issue を no-plan で差し戻す。渡す側の skill がそれを書いて
// いないと、案内どおりに渡した人が Load 段で止まる。DR-0089 でこの挙動へ戻したとき、
// slice は直したが issue と fix を取りこぼした。文言の取りこぼしは実行時に何も落ちない
// ので、この静的照合が次の取りこぼしを検出する。
test("build へ渡す案内は同じ行で Plan 節の必要性に触れる", () => {
  const docs = skillDocs();
  assert.ok(docs.length > 0, "skill の SKILL.md を読める");

  const missing = [];
  for (const { lang, name, path } of docs) {
    for (const [i, line] of readFileSync(path, "utf8").split("\n").entries()) {
      if (!HANDOFF.test(line)) continue;
      if (/Plan|plan/.test(line)) continue;
      missing.push(`${lang}:${name}:${i + 1}: ${line.trim().slice(0, 60)}`);
    }
  }
  assert.deepEqual(missing, [], `build へ渡す案内が Plan 節に触れていない\n${missing.join("\n")}`);
});
