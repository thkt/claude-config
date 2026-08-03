import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
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

// docs の取得手段を指示する 3 箇所。手段は scout に揃える。片方だけ手段を絞ると、
// 読み手はどちらを先に試すのか決められない。
test("docs の取得手段が scout で揃う", () => {
  for (const [name, path] of Object.entries(sites)) {
    assert.match(readFileSync(path, "utf8"), /scout fetch/, `${name}: 取得手段が scout fetch`);
  }
});

// WebFetch と WebSearch は PreToolUse hook で deny しうるので、代替手段として書けない。
// 名前を出した時点で読み手が第 2 の経路と受け取るため、言及ごと禁じる。
test("WebFetch / WebSearch を代替経路として挙げない", () => {
  for (const [name, path] of Object.entries(sites)) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /WebFetch|WebSearch/, `${name}: 言及なし`);
  }
});

// scout で読めなかったときの扱い。代替手段が無い以上、記憶を確定情報として書かせない。
test("scout で読めないときは unverified 扱いにする", () => {
  const unverified = {
    "code.js (ja)":
      /scout が無い、または fetch が失敗して読めなければ、その API 使用を未確認として/,
    "code.js (en)": /When scout is unavailable or the fetch fails, mark that API usage unverified/,
    "SOURCING.md (ja)": /scout 未導入\) のときは、その API 使用を `unverified`/,
    "SOURCING.md (en)": /scout not installed\), mark that API usage `unverified`/,
    "research/verification.md (ja)": /scout 未導入などで一次ソースが辿れない場合/,
    "research/verification.md (en)":
      /or scout not being installed, keep the finding but mark it `unverified external claim`/,
  };
  for (const [name, path] of Object.entries(sites)) {
    assert.match(readFileSync(path, "utf8"), unverified[name], `${name}: unverified 扱い`);
  }
});
