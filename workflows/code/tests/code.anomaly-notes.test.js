import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sites = {
  ja: join(root, ".ja", "workflows", "code.js"),
  en: join(root, "workflows", "code.js"),
};

// notes と evidence を分けないと、agent は ctx の「各 claim を tool result と突き合わせる」
// 指示を 1 本の散文への証拠列挙と解釈する。PR 本文の anomaly は改行を潰して 1 行に描画するため、
// 読み手は結論の切れ目を見つけられない。
test("no-red の notes は結論 1 文に絞り、根拠を evidence へ分ける", () => {
  const split = {
    ja: /結論を 1 文で書く/,
    en: /the conclusion in one sentence/,
  };
  const separate = {
    ja: /根拠は notes に混ぜず evidence へ分ける/,
    en: /Keep the supporting facts out of notes and put them in evidence/,
  };
  for (const [name, path] of Object.entries(sites)) {
    const src = readFileSync(path, "utf8");
    assert.match(src, split[name], `${name}: notes は結論 1 文`);
    assert.match(src, separate[name], `${name}: 根拠は evidence へ`);
  }
});

// schema の description だけでは Red retry の「精査せよ」に押し負け、精査の経過が notes に
// 流れ込む。prompt 側にも分担を置く。
test("Red の prompt が notes と evidence の分担を伝える", () => {
  const split = {
    ja: [
      /結論を notes に 1 文で、根拠を evidence に 1 項目 1 行で書く/,
      /notes に書くのは結論 1 文だけで/,
    ],
    en: [
      /put the conclusion in notes as one sentence and the supporting facts in evidence/,
      /notes carries the conclusion alone, one sentence/,
    ],
  };
  for (const [name, path] of Object.entries(sites)) {
    const src = readFileSync(path, "utf8");
    assert.match(src, split[name][0], `${name}: Red が分担を伝える`);
    assert.match(src, split[name][1], `${name}: Red retry が分担を伝える`);
  }
});

test("no-red anomaly が evidence を PR へ運ぶ", () => {
  for (const [name, path] of Object.entries(sites)) {
    const src = readFileSync(path, "utf8");
    assert.match(src, /"red_confirmed", "test_files", "notes", "evidence"/, `${name}: schema 必須`);
    assert.match(src, /evidence: Array\.isArray\(red\.evidence\)/, `${name}: anomaly が運ぶ`);
  }
});
