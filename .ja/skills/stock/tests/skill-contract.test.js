import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "stock", "SKILL.md"),
  en: join(root, "skills", "stock", "SKILL.md"),
};

// SKILL.md が指すパスは agent が Read する。ファイル名の文字列一致で見張ると、参照先を
// rename して SKILL.md を直し忘れた場合に通り、両方正しく直した場合に落ちる。捕まえたい
// のは参照先の不在なので、実在するかどうかで見る。
const refsIn = (doc) => [...doc.matchAll(/\$\{CLAUDE_SKILL_DIR\}(\/[\w./-]+)/g)].map((m) => m[1]);

test("SKILL.md が指す skill 内のパスがすべて実在する", () => {
  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${lang}: ${path} が存在する`);
    const refs = new Set(refsIn(readFileSync(path, "utf8")));
    assert.ok(refs.size > 0, `${lang}: skill 内への参照が 1 つ以上ある`);
    for (const ref of refs) {
      const resolved = join(dirname(path), ref);
      assert.ok(existsSync(resolved), `${lang}: ${ref} の参照先が実在する`);
    }
  }
});

// 判定本体を呼ぶ手順と、結果を読むためのフォーマット規約。どちらを落としても、SKILL.md を
// 読む agent は何を実行しどう読むか分からなくなる。ファイル名でなく置き場所で見張る。
test("SKILL.md が scripts と references の両方を参照している", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const refs = refsIn(readFileSync(path, "utf8"));
    assert.ok(
      refs.some((ref) => ref.startsWith("/scripts/")),
      `${lang}: 実行する script を参照する`,
    );
    assert.ok(
      refs.some((ref) => ref.startsWith("/references/")),
      `${lang}: 判定を読むための規約を参照する`,
    );
  }
});
