#!/usr/bin/env node
//   list    <xlsx>                          シート一覧と充填率を出す
//   extract <xlsx> --out <dir> [options]    シートを Markdown へ変換する
//   verify  <xlsx> <dir>                    元の全セルが出力に残っているか照合する

import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  cellText,
  fillRatio,
  isColumnRuler,
  profiles,
  sheetFileName,
  sheetToMarkdown,
} from "./convert.js";

const out = (text) => process.stdout.write(`${text}\n`);
const err = (text) => process.stderr.write(`${text}\n`);

let readXlsx;
try {
  ({ readXlsx } = await import("hucre/xlsx"));
} catch {
  err(
    "hucre が入っていない。このスクリプトより上のディレクトリで `bun add hucre` を実行する。" +
      "開発ツリーならリポジトリのルート、プラグイン導入先なら ~/.claude。",
  );
  process.exit(2);
}

const parseArgs = (argv) => {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) options[arg.slice(2)] = argv[++i];
    else positional.push(arg);
  }
  return { positional, options };
};

const { positional, options } = parseArgs(process.argv.slice(2));
const [command, source, target] = positional;

if (!command || !source) {
  err("usage: cli.js <list|extract|verify> <xlsx> [args]");
  process.exit(2);
}

const buffer = await readFile(source);

if (command === "list") {
  const workbook = await readXlsx(buffer);
  const { total, filled, ratio } = fillRatio(workbook.sheets);
  for (const [index, sheet] of workbook.sheets.entries()) {
    out(`[${index}] ${sheet.name} - ${sheet.rows.length} rows`);
  }
  out(
    `\nsheets: ${workbook.sheets.length} / cells: ${total.toLocaleString()} / ` +
      `filled: ${filled.toLocaleString()} (${(ratio * 100).toFixed(1)}%)`,
  );
  // 閾値は書式ごとに違うので、ここで分岐せず判断を読み手に返す。
  if (ratio < 0.2) out("充填率が低い。extract で整形してから読む。");
  process.exit(0);
}

if (command === "extract") {
  const outDir = options.out;
  if (!outDir) {
    err("extract には --out <dir> が要る。");
    process.exit(2);
  }
  const profileName = options.profile ?? "generic";
  const profile = profiles[profileName];
  if (!profile) {
    err(`profile が無い: ${profileName} (${Object.keys(profiles).join(", ")})`);
    process.exit(2);
  }
  // 読み込み結果はファイル名に要る元のシート位置を落としており、判定関数だけが
  // その位置を見られる。
  const only = options.sheet;
  let resolved = null;
  let filter;
  if (only != null && /^\d+$/.test(only)) {
    resolved = Number(only);
    filter = { sheets: [resolved] };
  } else if (only != null) {
    filter = {
      sheets: (info) => {
        if (info.name !== only) return false;
        resolved = info.index;
        return true;
      },
    };
  }
  const workbook = await readXlsx(buffer, filter);
  if (only != null && workbook.sheets.length === 0) {
    err(`シートが見つからない: ${only}。list で名前と番号を確かめる。`);
    process.exit(1);
  }
  await mkdir(outDir, { recursive: true });

  const index = [
    `# ${source.split("/").pop()}`,
    "",
    `profile: \`${profileName}\``,
    "",
    "| # | シート | 行数 | ファイル |",
    "| --- | --- | --- | --- |",
  ];
  for (const [position, sheet] of workbook.sheets.entries()) {
    const number = resolved ?? position;
    const file = sheetFileName(number, sheet.name);
    await writeFile(`${outDir}/${file}`, sheetToMarkdown(sheet, profile));
    index.push(
      `| ${number} | ${sheet.name} | ${sheet.rows.length} | [${file}](${encodeURI(file)}) |`,
    );
  }
  if (only == null) await writeFile(`${outDir}/index.md`, `${index.join("\n")}\n`);
  out(`${workbook.sheets.length} sheets -> ${outDir}`);
  process.exit(0);
}

if (command === "verify") {
  if (!target) {
    err("verify には出力ディレクトリが要る。");
    process.exit(2);
  }
  const workbook = await readXlsx(buffer);
  const missing = [];
  for (const [index, sheet] of workbook.sheets.entries()) {
    let markdown;
    try {
      markdown = await readFile(`${target}/${sheetFileName(index, sheet.name)}`, "utf8");
    } catch {
      missing.push({ sheet: sheet.name, reason: "出力が無い" });
      continue;
    }
    // escapeCell の変換を戻さないと、エスケープしたセルがすべて欠落として出る。
    const flat = markdown.replace(/<br>/g, "").replace(/\\\|/g, "|").replace(/\s+/g, "");
    let lost = 0;
    let sample = "";
    for (const row of sheet.rows) {
      const cells = row
        .map((cell) => cellText(cell).trim())
        .filter((t) => t !== "");
      // 列番号のものさしは変換後の Markdown に残らないため、数えると毎シート欠落として
      // 報告され、本物の欠落が埋もれる。
      if (isColumnRuler(cells)) continue;
      for (const text of cells) {
        if (flat.includes(text.replace(/\s+/g, ""))) continue;
        lost++;
        if (!sample) sample = text.slice(0, 40);
      }
    }
    if (lost) missing.push({ sheet: sheet.name, lost, sample });
  }
  if (!missing.length) {
    out(`OK: ${workbook.sheets.length} シートの全セルが出力に残っている。`);
    process.exit(0);
  }
  for (const entry of missing) {
    err(`${entry.sheet}: ${entry.reason ?? `${entry.lost} セル欠落`} ${entry.sample ?? ""}`);
  }
  process.exit(1);
}

err(`不明なコマンド: ${command}`);
process.exit(2);
