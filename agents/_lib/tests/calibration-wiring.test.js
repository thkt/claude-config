import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sides = {
  ja: {
    cal: join(root, ".ja", "agents", "_lib", "calibration-examples.md"),
    rev: join(root, ".ja", "agents", "reviewers"),
  },
  en: {
    cal: join(root, "agents", "_lib", "calibration-examples.md"),
    rev: join(root, "agents", "reviewers"),
  },
};

// "## CHX (reviewer-resilience)" 形の見出しから、セクション記号と所有 reviewer を取る。
const sectionsOf = (calPath) =>
  new Map(
    [...readFileSync(calPath, "utf8").matchAll(/^## ([A-Z0-9]+) \((reviewer-[a-z-]+)\)$/gm)].map(
      (m) => [m[1], m[2]],
    ),
  );

// reviewer 定義が参照するセクション記号。Calibration 節を持たない reviewer は null。
const refsOf = (revDir) => {
  const out = new Map();
  for (const file of readdirSync(revDir).filter((f) => f.endsWith(".md"))) {
    const doc = readFileSync(join(revDir, file), "utf8");
    // en は "section SEC"、ja は "の SEC セクション" で記号の位置が逆になる。
    const m =
      doc.match(/calibration-examples\.md[^\n]*?section ([A-Z0-9]+)/) ||
      doc.match(/calibration-examples\.md[^\n]*?の ([A-Z0-9]+) セクション/);
    out.set(file.replace(/\.md$/, ""), m ? m[1] : null);
  }
  return out;
};

// 参照先が消えても reviewer は黙って較正なしで走る。実行時に気づけないので突き合わせる。
test("reviewer が参照するセクションが実在する", () => {
  for (const [lang, { cal, rev }] of Object.entries(sides)) {
    const sections = sectionsOf(cal);
    for (const [reviewer, ref] of refsOf(rev)) {
      if (ref === null || sections.has(ref)) continue;
      // 不在を許すのは、reviewer 側が較正なしの振る舞いを決めているときだけ。
      const doc = readFileSync(join(rev, `${reviewer}.md`), "utf8");
      assert.match(
        doc,
        /pending_calibration/,
        `${lang}: ${reviewer} が参照する ${ref} が無く、フォールバックの指定も無い`,
      );
    }
  }
});

// セクションを書いても reviewer 側に Calibration 節が無ければ読まれない。CHX が
// この状態で放置されていた。
test("すべてのセクションに読み手がいる", () => {
  for (const [lang, { cal, rev }] of Object.entries(sides)) {
    const used = new Set([...refsOf(rev).values()].filter(Boolean));
    for (const [symbol, owner] of sectionsOf(cal)) {
      assert.ok(used.has(symbol), `${lang}: ${symbol} (${owner}) を読む reviewer がいない`);
    }
  }
});

// 例の中の見出しが code fence の外に出ると、トップレベル見出しとして浮く。DOC
// セクションはこの壊れ方をしていて、セクション自体が検出できなくなっていた。
test("トップレベル見出しがセクション見出しだけである", () => {
  for (const [lang, { cal }] of Object.entries(sides)) {
    const doc = readFileSync(cal, "utf8").replace(/^```[a-z]*\n.*?^```/gms, "");
    const strays = [...doc.matchAll(/^## (.+)$/gm)]
      .map((m) => m[1])
      .filter((h) => !/^[A-Z0-9]+ \(reviewer-[a-z-]+\)$/.test(h));
    assert.deepEqual(strays, [], `${lang}: セクション見出し以外が浮いている`);
  }
});

// コード例は翻訳対象外。ja と en で内容が割れると、同じ較正を与えたつもりで別の
// コードを見せることになる。
test("コード例が ja と en で一致する", () => {
  const blocks = (p) => readFileSync(p, "utf8").match(/^```[a-z]*\n[\s\S]*?^```/gm) || [];
  const ja = blocks(sides.ja.cal);
  const en = blocks(sides.en.cal);
  assert.equal(ja.length, en.length, "コードブロックの個数が一致する");
  ja.forEach((block, i) => assert.equal(block, en[i], `${i + 1} 番目のコードブロックが一致する`));
});
