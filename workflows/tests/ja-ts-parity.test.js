// hooks/_lib/mirror_prose.py's TARGET_SUFFIXES already covers .ts and already checks whether
// the prose in a mirrored pair carries Japanese. What it does not check is whether the two
// files agree outside their prose: a translated comment must sit over identical code, and a
// line count staying equal on both sides is not enough to prove that (see
// docs/wiki/count-comparison-masks-filtered-set-drift.md) — content has to be compared.
import { test } from "node:test";
import assert from "node:assert/strict";

// Mirrors hooks/_lib/mirror_prose.py's COMMENT_LINE (`^\s*(#|//|\*)`) for the .ts comment
// markers it already treats as prose. Stripping those lines and comparing the remaining
// source text — not its line count — is what proves the two files agree outside prose (see
// docs/wiki/count-comparison-masks-filtered-set-drift.md).
const TS_COMMENT_LINE = /^\s*(\/\/|\*)/;

const stripTsComments = (src) =>
  src
    .split("\n")
    .filter((line) => !TS_COMMENT_LINE.test(line))
    .join("\n");

const tsBodyMatches = (en, ja) => stripTsComments(en) === stripTsComments(ja);

test("コメントだけが異なる EN と .ja の .ts ペアが一致と判定される", () => {
  const en = [
    "// Adds two numbers.",
    "export function add(a: number, b: number): number {",
    "  return a + b;",
    "}",
    "",
  ].join("\n");
  const ja = [
    "// 二つの数を足す。",
    "export function add(a: number, b: number): number {",
    "  return a + b;",
    "}",
    "",
  ].join("\n");
  assert.equal(tsBodyMatches(en, ja), true);
});

test("識別子が 1 つ異なるペアが不一致として落ちる", () => {
  const en = [
    "export function add(a: number, b: number): number {",
    "  return a + b;",
    "}",
    "",
  ].join("\n");
  const ja = [
    "export function add(x: number, b: number): number {",
    "  return x + b;",
    "}",
    "",
  ].join("\n");
  assert.equal(tsBodyMatches(en, ja), false);
});

test("EN 側にだけ文が 1 つ多いペアが不一致として落ちる", () => {
  const en = [
    "export function add(a: number, b: number): number {",
    "  const sum = a + b;",
    "  return sum;",
    "}",
    "",
  ].join("\n");
  const ja = [
    "export function add(a: number, b: number): number {",
    "  return a + b;",
    "}",
    "",
  ].join("\n");
  assert.equal(tsBodyMatches(en, ja), false);
});
