import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "dr", "SKILL.md"),
  en: join(root, "skills", "dr", "SKILL.md"),
};
const templates = {
  ja: join(root, ".ja", "skills", "dr", "templates", "madr-template.md"),
  en: join(root, "skills", "dr", "templates", "madr-template.md"),
};
const formats = {
  ja: join(root, ".ja", "skills", "dr", "references", "madr-format.md"),
  en: join(root, "skills", "dr", "references", "madr-format.md"),
};
// The scripts are identical copies on both sides, so one path covers the pair.
const preCheck = join(root, "skills", "dr", "scripts", "pre-check.py");
const validate = join(root, "skills", "dr", "scripts", "validate-dr.py");

// pre-check.py が返すキーは SKILL.md が使い先を書いて初めて生きる。number と filename を
// 名指ししないと自動採番の結果が捨てられ、agent がファイル名を自分で作る。
test("pre-check.py の出力キーを SKILL.md が使う", () => {
  const src = readFileSync(preCheck, "utf8");
  const block = src.slice(src.indexOf("print(json.dumps({"));
  const keys = [...block.matchAll(/^\s{8}"(\w+)":/gm)].map((m) => m[1]);
  assert.ok(keys.includes("filename"), `出力キーを読める (${keys.join(", ")})`);
  assert.ok(keys.length >= 6, `キーが 6 つ以上ある (${keys.length} 件)`);

  const consumed = ["number", "filename", "dr_dir", "similar_drs", "date"];
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    for (const key of consumed) {
      assert.match(doc, new RegExp(`\\b${key}\\b`), `${lang}: SKILL.md が ${key} を名指しする`);
    }
  }
});

// DR へのリネーム後に取り残された表記を弾く。status の値は validate-dr.py が検査しないので、
// 表記が割れたまま両方が通ってしまう。
test("supersede の識別子が DR-NNNN に揃う", () => {
  for (const group of [skills, templates, formats]) {
    for (const [lang, path] of Object.entries(group)) {
      const doc = readFileSync(path, "utf8");
      assert.doesNotMatch(doc, /ADR-NNNN/, `${lang}: ${path} に ADR-NNNN が残っていない`);
    }
  }
  for (const [lang, path] of Object.entries(formats)) {
    assert.match(readFileSync(path, "utf8"), /superseded by DR-NNNN/, `${lang}: DR-NNNN を書く`);
  }
});

// DR はアーキテクチャに限らない決定を指す。旧称 ADR が指示や規約に残ると、書き手は
// アーキテクチャ決定だけを記録対象と読む。除外は明示リストにして、新しい ADR- の混入を落とす。
test("live な指示と規約に旧称 ADR が残っていない", () => {
  const EXEMPT = [
    // Fowler の記事要約。出典側の用語なので ADR のまま引用し、その旨を本文が宣言する。
    "skills/dr/references/fowler-adr.md",
    // このテスト自身が ADR- を negative assert に使う。
    "skills/dr/tests/script-contract.test.js",
  ];
  const fowler = {
    ja: [
      join(root, ".ja", "skills", "dr", "references", "fowler-adr.md"),
      /このファイルでは ADR と呼ぶ/,
    ],
    en: [join(root, "skills", "dr", "references", "fowler-adr.md"), /it says ADR throughout/],
  };
  for (const [lang, [path, declaration]] of Object.entries(fowler)) {
    assert.match(readFileSync(path, "utf8"), declaration, `${lang}: 除外の根拠を本文が宣言する`);
  }
  // build の manual acceptance を通す環境変数名。prose ではなく knob なので改名しない。
  const ENV_KNOB = /ADR0085_MANUAL_ACCEPTANCE/g;
  // when_to_use は利用者が打つ語の一覧。旧称で呼ぶ人に届かせるため ADR も並べておく。
  const TRIGGERS = /^when_to_use:.*$/gm;
  const scanned = [];
  for (const prefix of ["", ".ja"]) {
    for (const dir of ["skills", "agents", "rules", "workflows"]) {
      const base = join(root, prefix, dir);
      if (!existsSync(base)) continue;
      for (const entry of readdirSync(base, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !/\.(md|js|py)$/.test(entry.name)) continue;
        const full = join(entry.parentPath ?? entry.path, entry.name);
        const rel = full.slice(join(root, prefix).length + 1);
        if (EXEMPT.includes(rel) || rel.includes("__pycache__")) continue;
        scanned.push(rel);
        const text = readFileSync(full, "utf8").replace(ENV_KNOB, "").replace(TRIGGERS, "");
        assert.doesNotMatch(text, /\bADRs?\b/, `${prefix || "en"}: ${rel} に旧称 ADR が残る`);
      }
    }
  }
  assert.ok(scanned.length > 100, `走査した件数 (${scanned.length})`);
  assert.doesNotMatch(readFileSync(join(root, "README.md"), "utf8"), /\bADRs?\b/, "README.md");
});

// MADR は v4 で名称が Architectural に戻った外部仕様。この skill が対象を広げていることを
// 書いておかないと、名称を読んだ書き手がアーキテクチャ決定だけに絞る。
test("madr-format がアーキテクチャに限らない旨を述べる", () => {
  assert.match(
    readFileSync(formats.ja, "utf8"),
    /アーキテクチャに限らない決定/,
    "ja: 対象の広がりを述べる",
  );
  assert.match(
    readFileSync(formats.en, "utf8"),
    /decisions beyond architecture/,
    "en: 対象の広がりを述べる",
  );
});

// frontmatter の表とテンプレートは書き手が往復する 2 面。表にある枠がテンプレートに無いと、
// 書き手はフィールドを手で足すことになる。
test("frontmatter の全フィールドがテンプレートに枠を持つ", () => {
  const FIELDS = ["status", "date", "decision-makers", "consulted", "informed"];
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    for (const field of FIELDS) {
      assert.match(doc, new RegExp(`^\\| ${field} `, "m"), `${lang}: 表に ${field} の行`);
    }
  }
  for (const [lang, path] of Object.entries(templates)) {
    const doc = readFileSync(path, "utf8");
    for (const field of FIELDS) {
      assert.match(doc, new RegExp(`^${field}: `, "m"), `${lang}: テンプレートに ${field} の枠`);
    }
  }
});

// validate-dr.py の必須セクションとテンプレートの見出し。片方が欠けると、書いた DR が
// Phase 4 で必ず missing_section で落ちる。
test("必須セクションがテンプレートと validate-dr.py で一致する", () => {
  const src = readFileSync(validate, "utf8");
  const sections = [...src.matchAll(/^\s{4}"([^"]+)",$/gm)].map((m) => m[1]);
  assert.ok(sections.length >= 4, `必須セクションを読める (${sections.join(" / ")})`);
  for (const [lang, path] of Object.entries(templates)) {
    const doc = readFileSync(path, "utf8");
    for (const section of sections) {
      assert.match(doc, new RegExp(`^#{2,3} ${section}$`, "m"), `${lang}: ${section} の見出し`);
    }
  }
});

// フェーズ数は本文の 3 箇所に散る。表の行だけ増減させると宣言した数と合わなくなる。
test("宣言したフェーズ数が表の行数と一致する", () => {
  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${path} が存在する`);
    const doc = readFileSync(path, "utf8");
    const declared = doc.match(/(\d) ?(フェーズプロセス|-Phase Process)/g) || [];
    assert.equal(declared.length, 3, `${lang}: フェーズ数の宣言が 3 箇所 (${declared.length})`);
    const counts = new Set(declared.map((d) => d[0]));
    assert.equal(counts.size, 1, `${lang}: 3 箇所が同じ数 (${[...counts].join(", ")})`);
    const rows = doc.match(/^\| \d {4}\| /gm) || [];
    assert.equal(rows.length, Number([...counts][0]), `${lang}: 表の行数が宣言と一致する`);
  }
});
