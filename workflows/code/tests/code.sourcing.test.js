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

// The three places instructing how to fetch docs. The means is scout everywhere. Narrowing it
// in one place alone leaves the reader unable to tell which to reach for first.
test("every site names scout as the way to fetch docs", () => {
  for (const [name, path] of Object.entries(sites)) {
    assert.match(readFileSync(path, "utf8"), /scout fetch/, `${name}: the means is scout fetch`);
  }
});

// A PreToolUse hook can deny WebFetch and WebSearch, so neither works as a fallback. Naming
// one makes the reader take it as a second route, so the mention itself is prohibited.
test("no site offers WebFetch or WebSearch as a fallback route", () => {
  for (const [name, path] of Object.entries(sites)) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /WebFetch|WebSearch/, `${name}: no mention`);
  }
});

// What happens when scout cannot read it. With no fallback, memory must not be written down as
// confirmed fact.
test("every site marks an unreadable source as unverified", () => {
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
    assert.match(readFileSync(path, "utf8"), unverified[name], `${name}: marked unverified`);
  }
});
