// Convert xlsx sheets into Markdown.
// Generic extraction and per-layout judgment are kept apart. A profile carries the layout judgment.

/** Turn a cell value into text. Dates, formulas and rich text each arrive in their own shape. */
export function cellText(cell) {
  if (cell == null) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === "object") {
    if ("text" in cell) return String(cell.text);
    if ("formula" in cell) return cell.value != null ? String(cell.value) : `=${cell.formula}`;
    if ("error" in cell) return String(cell.error);
    return JSON.stringify(cell);
  }
  return String(cell);
}

/**
 * Drop empty cells and return the rest with their column position.
 * Business spreadsheets spread one item across several cells via merges, so the column
 * position is what lets the table columns and the item nesting be restored.
 */
export function cellsOf(row) {
  const out = [];
  for (let i = 0; i < row.length; i++) {
    const text = cellText(row[i]).replace(/ /g, " ").trim();
    if (text !== "") out.push({ col: i, text });
  }
  return out;
}

/** A row holding only 1,2,3,... is Excel's column-number guide, so drop it. */
export function isColumnRuler(cells) {
  if (cells.length < 10) return false;
  return cells.every((cell, i) => cell.text === String(i + 1));
}

/** Fill ratio across all sheets. The lower it is, the more layout-only empty cells, and the more conversion pays off. */
export function fillRatio(sheets) {
  let total = 0;
  let filled = 0;
  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      total += row.length;
      for (const cell of row) if (cellText(cell).trim() !== "") filled++;
    }
  }
  return { total, filled, ratio: total === 0 ? 0 : filled / total };
}

export function escapeCell(text) {
  return text.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

/**
 * Build column boundaries from the column positions of the header and sub-header rows.
 * A data cell is assigned to the interval its column position falls in, so an empty
 * middle column does not shift the columns to its right.
 */
export function buildColumns(head, sub) {
  const starts = [...new Set([...head, ...sub].map((cell) => cell.col))].sort((a, b) => a - b);
  const labelAt = new Map();
  for (const cell of [...head, ...sub]) labelAt.set(cell.col, cell.text);
  return starts.map((start, i) => ({
    start,
    end: i + 1 < starts.length ? starts[i + 1] : Infinity,
    label: labelAt.get(start) ?? "",
  }));
}

export function rowToCells(cells, columns, nestColumnLabel) {
  const slots = columns.map(() => []);
  for (const cell of cells) {
    let index = columns.findIndex((column) => cell.col >= column.start && cell.col < column.end);
    if (index < 0) index = 0;
    // In a nesting column, the cell position within the column carries the depth. Restore it with full-width spaces.
    const nested = nestColumnLabel && columns[index].label.includes(nestColumnLabel);
    const depth = nested ? cell.col - columns[index].start : 0;
    slots[index].push("　".repeat(Math.max(0, depth)) + cell.text);
  }
  return slots.map((values) => escapeCell(values.join(" ")));
}

/**
 * Layout profiles. A judgment whose value is null is not performed.
 * generic does not read anything as a table, so an unknown layout loses no cells.
 */
export const profiles = {
  generic: {
    docHeaderFirstCell: null,
    heading: null,
    tableHeadWords: null,
    nestColumnLabel: null,
    code: null,
  },
  "ja-api-spec": {
    docHeaderFirstCell: "案件名",
    heading: /^[0-9０-９]+[．.]\s*/,
    tableHeadWords: /^(項番|#|No\.?|版)$/,
    nestColumnLabel: "パラメータ名",
    code: /^[{}[\]"]|^curl\b|^-[HdX]\b|^https?:\/\/|^'|^}'/,
  },
};

// A header word also appears alone in the body, so the column count joins the word as a header condition.
function isTableHead(cells, profile) {
  if (!profile.tableHeadWords) return false;
  return cells.length >= 3 && profile.tableHeadWords.test(cells[0].text);
}

export function sheetToMarkdown(sheet, profile = profiles.generic) {
  const rows = sheet.rows.map(cellsOf);
  const lines = [`# ${sheet.name}`, ""];
  let i = 0;

  // In layouts carrying a document header, fold the leading rows into a quote.
  if (profile.docHeaderFirstCell && rows[0]?.[0]?.text === profile.docHeaderFirstCell) {
    const meta = [];
    for (const row of rows.slice(0, 3)) {
      if (!row.length || isColumnRuler(row)) continue;
      meta.push(row.map((cell) => cell.text).join(" / "));
    }
    if (meta.length) lines.push(`> ${meta.join("  \n> ")}`, "");
    i = 3;
  }

  let code = [];
  const flushCode = () => {
    if (!code.length) return;
    lines.push("```", ...code, "```", "");
    code = [];
  };

  while (i < rows.length) {
    const cells = rows[i];
    if (!cells.length || isColumnRuler(cells)) {
      flushCode();
      i++;
      continue;
    }
    const first = cells[0].text;

    if (profile.heading && profile.heading.test(first) && cells.length <= 2) {
      flushCode();
      lines.push(`## ${cells.map((cell) => cell.text).join(" / ")}`, "");
      i++;
      continue;
    }

    if (isTableHead(cells, profile)) {
      flushCode();
      const head = cells;
      let next = i + 1;
      let sub = [];
      // A data row always starts at the first column, so a row empty there is the second header tier.
      if (rows[next]?.length && rows[next][0].col > head[0].col) {
        sub = rows[next];
        next++;
      }
      const columns = buildColumns(head, sub);
      const body = [];
      while (next < rows.length) {
        const row = rows[next];
        if (!row.length) break;
        if (profile.heading && profile.heading.test(row[0].text) && row.length <= 2) break;
        if (isTableHead(row, profile)) break;
        body.push(rowToCells(row, columns, profile.nestColumnLabel));
        next++;
      }
      const labels = columns.map((column) => escapeCell(column.label));
      lines.push(`| ${labels.join(" | ")} |`);
      lines.push(`| ${labels.map(() => "---").join(" | ")} |`);
      for (const row of body) lines.push(`| ${row.join(" | ")} |`);
      lines.push("");
      i = next;
      continue;
    }

    if (profile.code && cells.length === 1 && profile.code.test(first)) {
      code.push(first);
      i++;
      continue;
    }

    flushCode();
    const text =
      cells.length === 1
        ? escapeCell(first)
        : `- ${cells.map((cell) => escapeCell(cell.text)).join(" / ")}`;
    lines.push(text, "");
    i++;
  }
  flushCode();

  return (
    lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^(- .*)\n\n(?=- )/gm, "$1\n") + "\n"
  );
}

export function sheetFileName(index, name) {
  return `${String(index).padStart(2, "0")}_${name.replace(/[/\\:*?"<>|]/g, "_")}.md`;
}
