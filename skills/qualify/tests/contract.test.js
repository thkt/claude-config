import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "qualify", "SKILL.md"),
  en: join(root, "skills", "qualify", "SKILL.md"),
};
const buildJs = join(root, "workflows", "build.js");

// Phase 3 の軸表を [軸, 通る条件, 重大度] のセル配列へ分解する。ヘッダ行と
// 区切り線 (---) の 2 行は判定対象に含めない。
function getPhase3DataRows(doc) {
  const phase3 = doc.slice(doc.indexOf("## Phase 3"), doc.indexOf("## Phase 4"));
  const lines = phase3.split("\n").filter((line) => line.trim().startsWith("|"));
  return lines.slice(2).map((line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim()),
  );
}

// 表示するドメインフィールドの追加・変更を検分する行が、通る条件に列挙先
// (AC と plan の T-NNN) を書いているかを言語別キーワードで判定する。
const FIELD_ROW_KEYWORDS = {
  ja: [/ドメインフィールド/, /列挙/, /(出典|agent)/i, /\bAC\b/, /T-NNN/],
  en: [/domain field/i, /enumerat/i, /(source|cite)/i, /\bAC\b/, /T-NNN/],
};

// build が Load 段で止まる条件は build.js の validate / oversizedUnits にしかない。
// qualify が条件を書き写すと、build 側だけ変わったとき verdict が嘘になる。写した
// 事実は実行時には何も落ちないので、この静的照合が単一情報源を強制する。閾値の写しは
// 言語ごとに言い回しが変わる (files <= 3 / files 3 個まで) ため、語ではなく数字の
// 不在で検出する。Phase 2 は手順の連番以外に数字を必要としない。
test("build の停止条件を skill 本文に書き写さない", () => {
  assert.match(
    readFileSync(buildJs, "utf8"),
    /const UNIT_CAPS = \{ files: \d+, tests: \d+ \};/,
    "build.js が UNIT_CAPS を数値で持つ",
  );

  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${path} が存在する`);
    const doc = readFileSync(path, "utf8");
    const phase2 = doc.slice(doc.indexOf("## Phase 2"), doc.indexOf("## Phase 3"));
    assert.ok(phase2.length > 0, `${lang}: Phase 2 を読める`);
    assert.doesNotMatch(
      phase2.replace(/^\d+\.\s/gm, "").replace(/Phase \d/g, ""),
      /\d/,
      `${lang}: Phase 2 に閾値や件数を書き写していない`,
    );
    assert.match(doc, /const validate = /, `${lang}: validate を実行時に特定する手順がある`);
    assert.match(doc, /const oversizedUnits = /, `${lang}: oversizedUnits も読む対象に入る`);
    assert.match(doc, /workflows\/build\.js/, `${lang}: 読む先が build.js だと書いている`);
  }
});

// 検分は読み取りに閉じる。gh の広い許可は comment 投稿の手段を与えてしまい、
// 「投稿しない」を prose の約束だけに委ねることになる。
test("allowed-tools が issue の読み取りに閉じている", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const tools = (readFileSync(path, "utf8").match(/^allowed-tools:.*$/m) || [""])[0];
    assert.match(tools, /Bash\(gh issue view:\*\)/, `${lang}: gh は issue view に限定する`);
    assert.doesNotMatch(tools, /Bash\(gh:\*\)/, `${lang}: gh 全体を許可しない`);
    assert.doesNotMatch(tools, /Write|Edit/, `${lang}: 検分は書き込み手段を持たない`);
  }
});

// verdict は 3 値で、needs-plan が最優先。Plan 節が無い issue に他の指摘を並べても
// 着手の判断は変わらないので、判定順が崩れると needs-fix と読み違える。
test("verdict 3 値と判定順が両言語で一致する", () => {
  const VERDICTS = ["needs-plan", "needs-fix", "build-ready"];
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const order = VERDICTS.map((v) => doc.indexOf(`| ${v}`));
    for (const [i, at] of order.entries()) {
      assert.ok(at >= 0, `${lang}: verdict 表に ${VERDICTS[i]} の行がある`);
    }
    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      order,
      `${lang}: verdict 表が needs-plan → needs-fix → build-ready の順`,
    );
  }
});

// Plan 節が無い issue は Phase 2 の早期終了で verdict を needs-plan に固定するが、
// Bug は着手後にまず原因を詰める必要があり、他の種別と次の手が違う。この分岐が
// 無いと needs-plan の Bug issue から「次に何をすべきか」が抜け落ちる。
test("各言語の SKILL.md が needs-plan でも Bug の原因言明を見る規則を持つ", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const phase2 = doc.slice(doc.indexOf("## Phase 2"), doc.indexOf("## Phase 3"));
    assert.match(phase2, /Bug/, `${lang}: Phase 2 が Bug を分岐条件として持つ`);
    assert.match(
      phase2,
      lang === "ja" ? /原因/ : /root cause/i,
      `${lang}: Phase 2 が Bug の原因言明を見る規則を持つ`,
    );
  }
});

// 打ち切りの理由文は「着手の判断は変えないが次の手は変わる」形に改まる契約。
// 数字は build.js への委譲対象で、この節に混ざると単一情報源の原則が崩れる。
test("Phase 2 節に数字が残らない既存の検査を通る", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const phase2 = doc.slice(doc.indexOf("## Phase 2"), doc.indexOf("## Phase 3"));
    assert.doesNotMatch(
      phase2.replace(/^\d+\.\s/gm, "").replace(/Phase \d/g, ""),
      /\d/,
      `${lang}: Phase 2 に数字が残っていない`,
    );
  }
});

// 表示するフィールドを追加・変更する issue は、そのフィールドを列挙している
// (または agent が読める出典を引いている) かを検分する blocker 行が要る。
// フィールド不変の UI issue はこの行に該当せず空振りで通る。
test("各言語の SKILL.md の軸表に重大度 blocker の表示フィールド行が存在する", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const fieldRow = getPhase3DataRows(doc).find(
      (cells) =>
        cells[2] === "blocker" && FIELD_ROW_KEYWORDS[lang].every((re) => re.test(cells[1])),
    );
    assert.ok(
      fieldRow,
      `${lang}: Phase 3 の軸表に表示フィールドの追加・変更を検分する blocker 行があり、通る条件が AC と T-NNN への列挙を指す`,
    );
  }
});

// 軸表への行追加は両言語同時が契約 (MIRROR.md)。一方だけ増えると mirror が崩れる。
test("軸表の行数が両言語で一致する", () => {
  const BASELINE_ROWS = 7; // 表示フィールド行を追加する前の Phase 3 軸表の行数
  const counts = {};
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    counts[lang] = getPhase3DataRows(doc).length;
    assert.ok(
      counts[lang] > BASELINE_ROWS,
      `${lang}: Phase 3 の軸表に表示フィールド行が追加されている`,
    );
  }
  assert.equal(counts.ja, counts.en, "軸表の行数が両言語で一致する");
});
