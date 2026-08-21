#!/usr/bin/env node
//   list    <xlsx>                          print the sheet list and the fill ratio
//   extract <xlsx> --out <dir> [options]    convert sheets into Markdown
//   verify  <xlsx> <dir>                    check that every source cell survived into the output

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { cellText, fillRatio, profiles, sheetFileName, sheetToMarkdown } from "./convert.js";

const out = (text) => process.stdout.write(`${text}\n`);
const err = (text) => process.stderr.write(`${text}\n`);

let readXlsx;
try {
  ({ readXlsx } = await import("hucre/xlsx"));
} catch {
  err("hucre is not installed. Run `bun add hucre` at the repository root.");
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
  // A file with a low fill ratio is mostly layout-only empty cells, and reading it raw
  // spends tokens on those. The threshold differs per layout, so the call goes back to the reader.
  if (ratio < 0.2) out("Fill ratio is low. Convert with extract before reading.");
  process.exit(0);
}

if (command === "extract") {
  const outDir = options.out;
  if (!outDir) {
    err("extract requires --out <dir>.");
    process.exit(2);
  }
  const profileName = options.profile ?? "generic";
  const profile = profiles[profileName];
  if (!profile) {
    err(`no such profile: ${profileName} (${Object.keys(profiles).join(", ")})`);
    process.exit(2);
  }
  // For a sheet named by name, the read result does not carry the original position the
  // file name needs. The predicate runs against sheet metadata before the body is parsed,
  // so capture the position there.
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
    err(`no such sheet: ${only}. Check the name and index with list.`);
    process.exit(1);
  }
  await mkdir(outDir, { recursive: true });

  const index = [
    `# ${source.split("/").pop()}`,
    "",
    `profile: \`${profileName}\``,
    "",
    "| # | Sheet | Rows | File |",
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
    err("verify requires the output directory.");
    process.exit(2);
  }
  const workbook = await readXlsx(buffer);
  const missing = [];
  for (const [index, sheet] of workbook.sheets.entries()) {
    let markdown;
    try {
      markdown = await readFile(`${target}/${sheetFileName(index, sheet.name)}`, "utf8");
    } catch {
      missing.push({ sheet: sheet.name, reason: "no output" });
      continue;
    }
    // The output turned newlines into <br> and pipes into \|, so undo that before comparing.
    const flat = markdown.replace(/<br>/g, "").replace(/\\\|/g, "|").replace(/\s+/g, "");
    let lost = 0;
    let sample = "";
    for (const row of sheet.rows) {
      const cells = row
        .map((cell) => cellText(cell).trim())
        .filter((t) => t !== "");
      // A row of nothing but 1,2,3,... is a column ruler and never survives into the Markdown.
      // Counting it would report a loss on every sheet and bury the real ones.
      if (cells.length >= 10 && cells.every((t, i) => t === String(i + 1))) continue;
      for (const text of cells) {
        if (flat.includes(text.replace(/\s+/g, ""))) continue;
        lost++;
        if (!sample) sample = text.slice(0, 40);
      }
    }
    if (lost) missing.push({ sheet: sheet.name, lost, sample });
  }
  if (!missing.length) {
    out(`OK: every cell of ${workbook.sheets.length} sheets survived into the output.`);
    process.exit(0);
  }
  for (const entry of missing) {
    err(`${entry.sheet}: ${entry.reason ?? `${entry.lost} cells lost`} ${entry.sample ?? ""}`);
  }
  process.exit(1);
}

err(`unknown command: ${command}`);
process.exit(2);
