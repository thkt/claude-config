import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const templates = {
  ja: join(root, ".ja", "skills", "outcome", "templates", "outcome.md"),
  en: join(root, "skills", "outcome", "templates", "outcome.md"),
};
const skills = {
  ja: join(root, ".ja", "skills", "outcome", "SKILL.md"),
  en: join(root, "skills", "outcome", "SKILL.md"),
};
const rules = {
  ja: join(root, ".ja", "rules", "core", "OUTCOME.md"),
  en: join(root, "rules", "core", "OUTCOME.md"),
};
const asserts = {
  ja: join(root, ".ja", "workflows", "assert.js"),
  en: join(root, "workflows", "assert.js"),
};
// The script is an identical copy on both sides, so one path covers the pair.
const script = join(root, "skills", "outcome", "scripts", "validate-outcome.py");

// 生成した OUTCOME.md の見出しは assert の bootstrap と challenge が digest 対象として名指しする。
// 綴りが揺れると digest が空で返り、下流は outcome 不在として扱う。
const HEADINGS = [
  /^## Outcome state$/m,
  /^### Behavior$/m,
  /^### Indicators$/m,
  /^## Non-goals$/m,
  /^## Constraints$/m,
];

test("テンプレートの見出しが両言語で英語のまま揃う", () => {
  for (const [lang, path] of Object.entries(templates)) {
    assert.ok(existsSync(path), `${path} が存在する`);
    const doc = readFileSync(path, "utf8");
    for (const heading of HEADINGS) {
      assert.match(doc, heading, `${lang}: ${heading} がテンプレートにある`);
    }
  }
});

// Indicators の 3 行は rules/core/OUTCOME.md § 中身 が定める分類。行が減ると
// テンプレートから消えた分類を書き手が思い出せない。
test("Indicators の分類がテンプレートと rules で一致する", () => {
  for (const [lang, path] of Object.entries(rules)) {
    const doc = readFileSync(path, "utf8");
    assert.ok(
      doc.includes("Time / Error rate / Value"),
      `${lang}: rules が Time / Error rate / Value を並べる`,
    );
  }
  for (const [lang, path] of Object.entries(templates)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /^\| Time {2,}\|/m, `${lang}: Time 行`);
    assert.match(doc, /^\| Error rate \|/m, `${lang}: Error rate 行`);
    assert.match(doc, /^\| Value {2,}\|/m, `${lang}: Value 行`);
  }
});

// 空判定の語。書き手はテンプレートの指示に従って TBD を書き、script がその語で空を判定し、
// SKILL.md の分岐表が判定結果を説明する。1 つだけ言い換えると、埋まっていない OUTCOME.md を
// 生成フローが更新フローへ流す。
test("空判定の語がテンプレート、SKILL.md、script で TBD に揃う", () => {
  for (const [lang, path] of Object.entries(templates)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /TBD/, `${lang}: テンプレートが TBD の書き方を指示する`);
  }
  const branchRow = {
    ja: /Behavior が空、または TBD のみ\s*\|/,
    en: /Behavior blank, or TBD only\s*\|/,
  };
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, branchRow[lang], `${lang}: 分岐表の行が TBD で生成へ振る`);
  }
  assert.match(
    readFileSync(script, "utf8"),
    /content\.upper\(\) == "TBD"/,
    "script が TBD を空として扱う",
  );
});

// assert の空判定を script に委ねた配線。prompt が自前で TBD を目視する形に戻ると、
// /outcome の判定基準と assert の判定基準が分かれる。
test("assert.js が validate-outcome.py の state で outcome の有無を決める", () => {
  for (const [lang, path] of Object.entries(asserts)) {
    const src = readFileSync(path, "utf8");
    assert.match(
      src,
      /OUTCOME_VALIDATOR = "\$HOME\/\.claude\/skills\/outcome\/scripts\/validate-outcome\.py"/,
      `${lang}: script のパスを持つ`,
    );
    assert.match(src, /\$\{OUTCOME_VALIDATOR\}/, `${lang}: bootstrap prompt が script を実行する`);
    assert.doesNotMatch(src, /all items are TBD|全項 TBD/, `${lang}: TBD の目視判定が残っていない`);
  }
});

// digest 対象の語。assert.js、challenge、validate-outcome.py の必須セクションが同じ 3 つを
// 指す。1 つが Outcome state のような親セクション名に戻ると、冒頭文の理想表現が digest に混ざる。
test("digest 対象が Behavior / Non-goals / Constraints に揃う", () => {
  const challenge = {
    ja: join(root, ".ja", "skills", "challenge", "SKILL.md"),
    en: join(root, "skills", "challenge", "SKILL.md"),
  };
  for (const [lang, path] of Object.entries(asserts)) {
    const src = readFileSync(path, "utf8");
    assert.match(src, /Behavior \/ Non-goals \/ Constraints/, `${lang}: assert.js の digest 語`);
  }
  for (const [lang, path] of Object.entries(challenge)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /Behavior \/ Non-goals \/ Constraints/, `${lang}: challenge の outcome_ref`);
    assert.doesNotMatch(
      doc,
      /Outcome state \/ Non-goals/,
      `${lang}: 親セクション名を digest 対象にしない`,
    );
  }
  assert.match(
    readFileSync(script, "utf8"),
    /FILLED_SECTIONS = \("Behavior", "Non-goals", "Constraints"\)/,
    "script の充填判定が同じ 3 セクションを見る",
  );
});

// 分岐を script に委ねた配線。SKILL.md が script を呼ばなくなると、判定が目視に戻る。
test("SKILL.md が validate-outcome.py で分岐し、検証まで回す", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    assert.match(
      doc,
      /\$\{CLAUDE_SKILL_DIR\}\/scripts\/validate-outcome\.py \.claude\/OUTCOME\.md/,
      `${lang}: 分岐で script を実行する`,
    );
    assert.match(doc, /^\| absent \|/m, `${lang}: state absent の行`);
    assert.match(doc, /^\| empty {2}\|/m, `${lang}: state empty の行`);
    assert.match(doc, /^\| ok {5}\|/m, `${lang}: state ok の行`);
    assert.match(
      doc,
      /Bash\(\$HOME\/\.claude\/skills\/outcome\/scripts\/\*\)/,
      `${lang}: allowed-tools が script の実行を許可する`,
    );
    const validateSteps = doc.match(/validate-outcome\.py/g) || [];
    assert.ok(
      validateSteps.length >= 3,
      `${lang}: 分岐、生成、更新の 3 箇所で script を回す (実際は ${validateSteps.length})`,
    );
  }
});

// 収集しない任意ブロックを落とす指示と、落とし損ねた {...} を弾く side。指示だけだと
// プレースホルダが .claude/OUTCOME.md に残り、assert の digest がそれを Behavior として読む。
test("生成手順が任意ブロックを落とし、残ったプレースホルダを script が弾く", () => {
  assert.match(
    readFileSync(skills.ja, "utf8"),
    /Indicators はセクションごと落とす/,
    "ja: Indicators を落とす指示",
  );
  assert.match(
    readFileSync(skills.en, "utf8"),
    /drop Indicators with its heading/,
    "en: Indicators を落とす指示",
  );
  for (const [lang, path] of Object.entries(skills)) {
    assert.match(
      readFileSync(path, "utf8"),
      /placeholder_left/,
      `${lang}: 生成手順が script の placeholder_left を名指しする`,
    );
  }
  assert.match(
    readFileSync(script, "utf8"),
    /placeholder_left:/,
    "script が placeholder_left を errors に積む",
  );
});
