import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const sites = {
  "code.js (ja)": join(root, ".ja", "workflows", "code.js"),
  "code.js (en)": join(root, "workflows", "code.js"),
  "SOURCING.md (ja)": join(root, ".ja", "rules", "development", "SOURCING.md"),
  "SOURCING.md (en)": join(root, "rules", "development", "SOURCING.md"),
  "research/verification.md (ja)": join(
    root,
    ".ja",
    "skills",
    "research",
    "references",
    "verification.md",
  ),
  "research/verification.md (en)": join(
    root,
    "skills",
    "research",
    "references",
    "verification.md",
  ),
};

// docs の取得手段を指示する 3 箇所。primary は scout、fallback は WebFetch で揃える。
// 片方だけ手段を絞ると、scout が入っている環境でも WebFetch に落ちるか、逆に scout の
// 無い環境で取得そのものが失敗する。
test("docs の取得が scout 優先 + WebFetch fallback で揃う", () => {
  for (const [name, path] of Object.entries(sites)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /scout fetch/, `${name}: primary が scout fetch`);
    assert.match(doc, /WebFetch/, `${name}: fallback が WebFetch`);
  }
});

// fallback を「scout が無いとき」に紐付ける。条件を書かないと、読み手はどちらを先に
// 試すのか決められない。
test("fallback の発動条件が書かれている", () => {
  const condition = {
    "code.js (ja)": /scout が無ければ WebFetch/,
    "code.js (en)": /falling back to WebFetch when scout is unavailable/,
    "SOURCING.md (ja)": /scout が入っていない環境では WebFetch/,
    "SOURCING.md (en)": /falling back to WebFetch where scout is not installed/,
    "research/verification.md (ja)": /scout が使えないときは/,
    "research/verification.md (en)": /When scout is unavailable/,
  };
  for (const [name, path] of Object.entries(sites)) {
    assert.match(readFileSync(path, "utf8"), condition[name], `${name}: 発動条件`);
  }
});

// 取得できなかったときの扱い。未確認のまま確定情報として書かせない。
test("取得できないときの扱いが決まっている", () => {
  const unresolved = {
    ja: /未確認としてコード内コメントに残し/,
    en: /mark that API usage unverified in a code comment/,
  };
  assert.match(readFileSync(sites["code.js (ja)"], "utf8"), unresolved.ja, "ja: 未確認の記録");
  assert.match(readFileSync(sites["code.js (en)"], "utf8"), unresolved.en, "en: 未確認の記録");
  for (const lang of ["ja", "en"]) {
    const doc = readFileSync(sites[`SOURCING.md (${lang})`], "utf8");
    assert.match(doc, /unverified/, `${lang}: rules も unverified を指示する`);
  }
});
