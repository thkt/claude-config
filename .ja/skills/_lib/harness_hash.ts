#!/usr/bin/env node
/// <reference types="node" />
// Usage: harness_hash.ts <skill-name>
//
// harness_hash.py の TypeScript 移植を段階的に進める最初のユニット。今回運ぶのは
// (name, content) の組の一覧を内容アドレス化する digest プリミティブのみ。digest() は
// harness_hash.py の _digest の TS 版で、gate.ts が自分の純関数 (tail, classifyObservation,
// ...) に使っているのと同じ形 -- 素直な named export にして in-process でテストする。
//
// 到着順でなく名前でソートする。ディレクトリを読む順序が機械ごとに違うと、同じ corpus が
// 別のハッシュになってしまうため。各組は name、`\0`、content、`\0` の順に update する。
// 名前と内容の境界をまたいでバイトが移動しても (名前の一部が内容側に移る、またはその逆)、
// この区切りがあることで digest が変わる。区切りが無いと、攻撃者や偶然のリネームが
// 再現できる連結と区別が付かなくなる。
//
// Contract: skills/_lib/harness_hash.py の _digest。
// skills/_lib/tests/harness-hash-digest.test.ts が検証する。
import { createHash } from "node:crypto";
import { isMainModule } from "../../workflows/_lib/entry-point.ts";

const NUL = Buffer.from([0]);

export function digest(pairs: Iterable<readonly [string, Buffer]>): string {
  const hash = createHash("sha256");
  const sorted = [...pairs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [name, content] of sorted) {
    hash.update(Buffer.from(name, "utf8"));
    hash.update(NUL);
    hash.update(content);
    hash.update(NUL);
  }
  return hash.digest("hex");
}

export function main(argv: string[]): number {
  void argv;
  throw new Error("not implemented");
}

if (isMainModule(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
