import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "fix", "SKILL.md"),
  en: join(root, "skills", "fix", "SKILL.md"),
};
const schema = join(root, "agents", "_lib", "finding-schema.md");
const integrator = join(root, "agents", "enhancers", "enhancer-integration.md");
const generator = join(root, "agents", "generators", "generator-test.md");

// ID prefix は finding-schema.md の registry が決める。A11Y のように数字を含む prefix があるので、
// 文字だけを許す正規表現は Finding ID を取り落として Standard Flow に落とす。エラーにならず
// 静かに Outcome Anchor と Build Check を走らせてしまう。
test("Finding ID の正規表現が registry の全 prefix を受ける", () => {
  const registry = readFileSync(schema, "utf8");
  const prefixes = [...registry.matchAll(/^\| ([A-Z0-9]+) {2,}\| reviewer-/gm)].map((m) => m[1]);
  assert.ok(prefixes.includes("A11Y"), "registry に数字入り prefix がある");
  assert.ok(prefixes.length >= 10, `registry から prefix を読める (${prefixes.length} 件)`);

  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const found = doc.match(/`\/(\^\[[^`]+?)\/`/);
    assert.ok(found, `${lang}: SKILL.md から Finding ID の正規表現を読める`);
    const pattern = new RegExp(found[1]);
    for (const prefix of prefixes) {
      assert.match(`${prefix}-001`, pattern, `${lang}: ${prefix}-001 が Finding ID として通る`);
    }
    assert.doesNotMatch("just a bug description", pattern, `${lang}: 散文は Finding ID にしない`);
    // Issue 引き継ぎの入力と競合させない。prefix に英字を要求しないと 1-2 が両方の行にマッチする。
    assert.doesNotMatch("1-2", pattern, `${lang}: 数字だけの prefix は Finding ID にしない`);
  }
});

// severity の語彙。finding-schema と enhancer-integration の出力が medium と書くので、
// トリアージ表が med と略すと snapshot の値と一致しない。
test("severity の語彙が schema と fix のトリアージで一致する", () => {
  for (const path of [schema, integrator]) {
    assert.match(
      readFileSync(path, "utf8"),
      /critical \/ high \/ medium \/ low/,
      `${path} が 4 段の severity を並べる`,
    );
  }
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /severity low \/ medium/, `${lang}: トリアージが medium と書く`);
    assert.doesNotMatch(doc, /severity low \/ med\b/, `${lang}: med の略記が残っていない`);
  }
});

// snapshot の finding が持つのは file / line / severity / summary の 4 つ。
// enhancer-integration.md § Auto-fix marking が fix_type を持たないと明言しているので、
// その語で分岐すると存在しないフィールドを読むことになる。
test("fix が snapshot に無いフィールドで分岐しない", () => {
  const src = readFileSync(integrator, "utf8");
  assert.match(src, /no dedicated fix_type field/, "integrator が fix_type の不在を明言する");
  for (const field of ["file", "line", "severity", "summary"]) {
    assert.match(src, new RegExp(`findings\\[\\]\\.${field}`), `snapshot が ${field} を持つ`);
  }
  for (const [lang, path] of Object.entries(skills)) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /fix_type/, `${lang}: fix_type で分岐しない`);
  }
});

// generator-test は root_cause を optional で受け、渡されたら振る舞いに束縛する。
// fix の Non-obvious は step 1 で root cause を得るので、渡さないとその optional が常に空になる。
test("generator-test への引き渡しが agent の Input と揃う", () => {
  const agent = readFileSync(generator, "utf8");
  assert.match(agent, /^\| root_cause \| optional \|/m, "agent が root_cause を optional で受ける");
  assert.match(agent, /When a root cause is passed/, "agent が root_cause の使い道を述べる");
  assert.match(
    readFileSync(skills.ja, "utf8"),
    /渡すのは symptom、再現手順、step 1 の root cause/,
    "ja: 3 つを渡す",
  );
  assert.match(
    readFileSync(skills.en, "utf8"),
    /Pass symptom, repro steps, and the root cause from step 1/,
    "en: 3 つを渡す",
  );
});

// issue から fix への引き継ぎ。issue 側の案内と fix 側の入力経路とエスカレーション閾値が
// 揃っていないと、issue が /fix を勧めた番号を fix が Standard Flow として読み直す。
test("issue から fix への引き継ぎが両側で揃う", () => {
  const issues = {
    ja: join(root, ".ja", "skills", "issue", "SKILL.md"),
    en: join(root, "skills", "issue", "SKILL.md"),
  };
  for (const [lang, path] of Object.entries(issues)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /`\/fix <(番号|number)>`/, `${lang}: issue が /fix を番号付きで勧める`);
    assert.match(doc, /1[〜-]3 ?(ファイル|files)/, `${lang}: 1-3 ファイルの下限側を示す`);
    assert.match(doc, /(4 ファイル以上|4 or more files)/, `${lang}: 4 ファイル以上は build へ`);
  }
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /`\/\^#\?\[0-9\]\+\$\/`/, `${lang}: fix が issue 番号のパターンを持つ`);
    assert.match(doc, /gh issue view/, `${lang}: 本文を gh issue view で読む`);
    assert.match(
      doc,
      /(次の 4 形式|one of four forms)/,
      `${lang}: 入力の列挙が issue 番号を数に入れている`,
    );
    assert.match(
      doc,
      /(起票済み issue の番号|the number of a filed issue)/,
      `${lang}: 列挙に issue 番号が並ぶ`,
    );
    assert.match(
      doc.split("---")[1],
      /(1〜3 ファイル|1-3 files)/,
      `${lang}: description が issue 引き継ぎを許す`,
    );
    assert.match(
      doc,
      /(4 ファイル以上|4\+ files)/,
      `${lang}: エスカレーション閾値が issue 側と同じ 4 ファイル`,
    );
  }
  const frontmatter = readFileSync(skills.en, "utf8").split("---")[1];
  assert.match(frontmatter, /Bash\(gh issue view:\*\)/, "allowed-tools が gh issue view を許す");
});

// 完了条件はチェックリスト。表に戻すと Required 列が Yes の羅列になり、埋める先が消える。
test("完了条件が両言語でチェックリスト形式", () => {
  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${path} が存在する`);
    const doc = readFileSync(path, "utf8");
    const items = doc.match(/^- \[ \] /gm) || [];
    assert.equal(items.length, 5, `${lang}: 完了条件が 5 項目 (実際は ${items.length})`);
  }
});
