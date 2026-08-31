// EN と .ja の .ts ペアが、コメントを除いた本文で一致していることを検査する。
// 一致判定は本文の内容そのもの (docs/wiki/count-comparison-masks-filtered-set-drift.md:
// 件数の一致は集合の一致を保証しない) で行い、行数や識別子の個数では代替しない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(TEST_DIR, "fixtures", "ja-ts-parity");

const read = (relative) => readFileSync(join(FIXTURES, relative), "utf8");

// 文字列 / テンプレートリテラルの内側にある // や /* は削らない。単純な正規表現置換だと
// `` `http://example.com` `` のようなコードまで本文から失われ、identifier-diff や
// extra-statement を誤って一致判定してしまう (docs/wiki/count-comparison-masks-filtered-set-drift.md)。
function stripComments(source) {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (two === "/*") {
      i += 2;
      while (i < n && source.slice(i, i + 2) !== "*/") i++;
      i += 2;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      i++;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\") {
          out += source[i] + (source[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += source[i];
        i++;
      }
      out += source[i] ?? "";
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// コメントを取り除いた本文を、行単位で正規化して返す。空行 / 前後の空白はコメント削除の
// 副産物として増減しうるので比較対象から外し、本文の内容そのものを比較する
// (docs/wiki/count-comparison-masks-filtered-set-drift.md: 件数ではなく内容を見る)。
function extractBody(source) {
  return stripComments(source)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function tsBodiesMatch(enSource, jaSource) {
  return extractBody(enSource) === extractBody(jaSource);
}

function fixturePair(scenario) {
  return {
    en: read(join(scenario, "sample.ts")),
    ja: read(join(scenario, ".ja", "sample.ts")),
  };
}

test("T-003 コメントだけが異なる EN と .ja の .ts ペアが一致と判定される", () => {
  const { en, ja } = fixturePair("comment-only");
  assert.equal(tsBodiesMatch(en, ja), true);
});

test("T-004 識別子が 1 つ異なるペアが不一致として落ちる", () => {
  const { en, ja } = fixturePair("identifier-diff");
  assert.equal(tsBodiesMatch(en, ja), false);
});

test("T-005 EN 側にだけ文が 1 つ多いペアが不一致として落ちる", () => {
  const { en, ja } = fixturePair("extra-statement");
  assert.equal(tsBodiesMatch(en, ja), false);
});
