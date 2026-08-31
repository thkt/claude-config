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
// Contract: skills/_lib/harness_hash.py の _digest / agent_name / definition_path /
// skill_path / test_dir / corpus_files / hashes。skills/_lib/tests/harness-hash-digest.test.ts
// と skills/_lib/tests/harness-hash-resolve.test.ts が検証する。Python の snake_case な名前は
// TS 側では camelCase になる。_digest -> digest で既に行ったのと同じリネームである。
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "../../workflows/_lib/entry-point.ts";

const NUL = Buffer.from([0]);

// skills/_lib/harness_hash.ts -> skills/_lib -> skills -> repo root。harness_hash.py の
// `Path(__file__).resolve().parents[2]` に対応する。
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// expected.json が名指すファイル集合ではない。答案の外にある case もレビュアーには届くため、
// それを見た run は別の corpus を測ったことになる。
export const CORPUS_PARTS = ["cases", "expected.json"] as const;

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

export interface HarnessHashes {
  definition_sha256: string;
  skill_sha256: string;
  corpus_sha256: string;
}

// replaceAll であって replace ではない。Python の str.replace は出現をすべて置換するため、
// 一回だけ置換する TS の .replace では、名前の中に 2 つ目の "use-context-" が残ってしまう。
export function agentName(skill: string): string {
  return skill.replaceAll("use-context-", "");
}

export function definitionPath(skill: string, root: string = ROOT): string {
  return join(root, "agents", "reviewers", `${agentName(skill)}.md`);
}

export function skillPath(skill: string, root: string = ROOT): string {
  return join(root, "skills", skill, "SKILL.md");
}

export function testDir(skill: string, root: string = ROOT): string {
  return join(root, "skills", skill, "test");
}

// 1 つのディレクトリ配下のファイルを再帰的にすべて集める。呼び出し側にとって順序は
// 意味を持たない。digest() が受け取った組を名前で必ず再ソートするため、この走査自体は
// 順序を保証する責務を持たない。
function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...filesUnder(full));
    } else if (entry.isFile()) {
      found.push(full);
    }
  }
  return found;
}

export function corpusFiles(skill: string, root: string = ROOT): string[] {
  const base = testDir(skill, root);
  const found: string[] = [];
  for (const part of CORPUS_PARTS) {
    const target = join(base, part);
    if (!existsSync(target)) {
      continue;
    }
    const stat = statSync(target);
    if (stat.isDirectory()) {
      found.push(...filesUnder(target));
    } else if (stat.isFile()) {
      found.push(target);
    }
  }
  return found;
}

export function hashes(skill: string, root: string = ROOT): HarnessHashes {
  const definition = definitionPath(skill, root);
  const body = skillPath(skill, root);
  for (const [path, what] of [
    [definition, "reviewer definition"],
    [body, "SKILL.md"],
  ] as const) {
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new Error(`no ${what} for ${skill}: ${path}`);
    }
  }
  const files = corpusFiles(skill, root);
  const base = testDir(skill, root);
  if (files.length === 0) {
    throw new Error(`no corpus for ${skill}: ${base}`);
  }
  return {
    definition_sha256: digest([[basename(definition), readFileSync(definition)]]),
    skill_sha256: digest([[basename(body), readFileSync(body)]]),
    corpus_sha256: digest(
      files.map((path): [string, Buffer] => [relative(base, path), readFileSync(path)]),
    ),
  };
}

// Python の main(argv) は sys.argv (スクリプト名を含む) を受け取るため、そちらの
// `len(argv) != 2` はここでは `argv.length !== 1` になる: main() は process.argv.slice(2)
// を受け取る、gate.ts の main() と同じ argv の扱いである。
export function main(argv: string[]): number {
  if (argv.length !== 1) {
    process.stderr.write("Usage: harness_hash.ts <skill-name>\n");
    return 2;
  }
  try {
    process.stdout.write(`${JSON.stringify(hashes(argv[0]))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
