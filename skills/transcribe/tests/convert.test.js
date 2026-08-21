import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const scriptPath = join(root, "skills", "transcribe", "scripts", "convert.js");
const { cellText, fillRatio, isColumnRuler, profiles, sheetToMarkdown } = await import(scriptPath);

// A business Excel spreads one item across several cells by merging them. In a merged run every
// cell after the first arrives as null, so the rows are built keeping their column positions.
const row = (...pairs) => {
  const cells = Array.from({ length: 20 }, () => null);
  for (const [col, value] of pairs) cells[col] = value;
  return cells;
};

const sheetOf = (...rows) => ({ name: "S", rows });

test("collapses the merged cells and restores the data into a table along the header column positions", () => {
  const markdown = sheetToMarkdown(
    sheetOf(
      row([2, "項番"], [4, "パラメータ名"], [12, "必須"], [14, "説明"]),
      row([2, "1"], [4, "account_name"], [12, "○"], [14, "アカウント名"]),
    ),
    profiles["ja-api-spec"],
  );

  assert.match(markdown, /\| 項番 \| パラメータ名 \| 必須 \| 説明 \|/);
  assert.match(markdown, /\| 1 \| account_name \| ○ \| アカウント名 \|/);
});

test("an empty column midway leaves the values to its right in their original columns", () => {
  const markdown = sheetToMarkdown(
    sheetOf(
      row([2, "項番"], [4, "パラメータ名"], [12, "必須"], [14, "説明"]),
      row([2, "4"], [4, "detail{}"], [14, "エラー内容詳細"]),
    ),
    profiles["ja-api-spec"],
  );

  assert.match(markdown, /\| 4 \| detail\{\} \|  \| エラー内容詳細 \|/);
});

test("takes in a second header row and splits the parent header across its child columns", () => {
  const markdown = sheetToMarkdown(
    sheetOf(
      row([2, "項番"], [4, "パラメータ名"], [12, "バリデーションチェック"], [18, "説明"]),
      row([12, "必須"], [14, "重複"], [16, "最小"]),
      row([2, "1"], [4, "password"], [12, "○"], [18, "パスワード"]),
    ),
    profiles["ja-api-spec"],
  );

  assert.match(markdown, /\| 項番 \| パラメータ名 \| 必須 \| 重複 \| 最小 \| 説明 \|/);
});

test("in a column expressing nesting, the cell position within the column restores as the hierarchy", () => {
  const markdown = sheetToMarkdown(
    sheetOf(
      row([2, "項番"], [4, "パラメータ名"], [14, "説明"]),
      row([2, "2"], [5, "error{}"], [14, "エラー内容"]),
      row([2, "3"], [6, "code"], [14, "エラーコード"]),
    ),
    profiles["ja-api-spec"],
  );

  assert.match(markdown, /\| 2 \| 　error\{\} \| エラー内容 \|/);
  assert.match(markdown, /\| 3 \| 　　code \| エラーコード \|/);
});

// `#` as a header word makes a comment row of that single character read as a table header, and
// the body in the neighboring cell vanishes without an error.
test("a two-cell row starting with one cell matching a header word stays body rather than becoming a table header", () => {
  const markdown = sheetToMarkdown(
    sheetOf(row([3, "#"], [4, "これは結局 admin_id が取得できない場合、ということ。"])),
    profiles["ja-api-spec"],
  );

  assert.match(markdown, /これは結局 admin_id が取得できない場合、ということ。/);
  assert.doesNotMatch(markdown, /\| --- \|/);
});

test("a column-number guide row holding nothing but a sequence drops from the output", () => {
  const ruler = Array.from({ length: 12 }, (_, i) => String(i + 1));
  assert.equal(isColumnRuler(ruler), true);
  assert.equal(sheetToMarkdown(sheetOf(ruler)).includes("| 1 | 2 |"), false);
});

test("generic does not read the sheet as a table and drops no cell even when the format is unknown", () => {
  const markdown = sheetToMarkdown(
    sheetOf(row([2, "項番"], [4, "パラメータ名"], [14, "説明"]), row([2, "1"], [4, "id"])),
    profiles.generic,
  );

  assert.doesNotMatch(markdown, /\| --- \|/);
  for (const text of ["項番", "パラメータ名", "説明", "id"])
    assert.match(markdown, new RegExp(text));
});

test("a date becomes an ISO date, a formula its evaluated value, and rich text its body", () => {
  assert.equal(cellText(new Date("2024-04-17T00:00:00Z")), "2024-04-17");
  assert.equal(cellText({ formula: "B1*2", value: 84 }), "84");
  assert.equal(cellText({ formula: "B1*2" }), "=B1*2");
  assert.equal(cellText({ text: "太字" }), "太字");
  assert.equal(cellText(null), "");
});

test("a newline inside a cell becomes <br> and a pipe is escaped so the table stays intact", () => {
  const markdown = sheetToMarkdown(
    sheetOf(
      row([2, "項番"], [4, "説明"], [6, "備考"]),
      row([2, "1"], [4, "真：可\n偽：不可"], [6, "a|b"]),
    ),
    profiles["ja-api-spec"],
  );

  assert.match(markdown, /真：可<br>偽：不可/);
  assert.match(markdown, /a\\\|b/);
});

test("a no-break space inside a cell becomes a plain space so the output stays greppable", () => {
  const markdown = sheetToMarkdown(
    sheetOf(row([2, "\u9805\u756a"], [4, "\u8aac\u660e"]), row([2, "1"], [4, "account\u00a0name"])),
    profiles["ja-api-spec"],
  );

  assert.match(markdown, /account name/);
  assert.doesNotMatch(markdown, /\u00a0/);
});

test("the fill rate returns the share of cells carrying a value and is 0 on an empty sheet", () => {
  assert.deepEqual(fillRatio([{ rows: [["a", null, null, null]] }]), {
    total: 4,
    filled: 1,
    ratio: 0.25,
  });
  assert.equal(fillRatio([{ rows: [] }]).ratio, 0);
});
