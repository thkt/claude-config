import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const templates = {
  ja: join(root, ".ja", "skills", "think", "templates", "plan.md"),
  en: join(root, "skills", "think", "templates", "plan.md"),
};
const skills = {
  ja: join(root, ".ja", "skills", "think", "SKILL.md"),
  en: join(root, "skills", "think", "SKILL.md"),
};

function read(path) {
  assert.ok(existsSync(path), `${path} が存在する`);
  return readFileSync(path, "utf8");
}

test("plan テンプレートが骨格 (id 記法・実装順・前提小節・1 行言明テスト・test_command・Backlog candidates) と行数規則を定義している", () => {
  for (const [lang, path] of Object.entries(templates)) {
    const doc = read(path);
    assert.match(doc, /### U-/, `${lang}: ### U- 記法`);
    assert.match(doc, /T-NNN/, `${lang}: T-NNN 記法`);
    if (lang === "ja") {
      assert.match(doc, /^### 前提/m, "ja: 前提小節");
      assert.match(doc, /unit は実装順に並べる/, "ja: 並び順 = 実装順");
      assert.match(doc, /条件と期待結果を 1 行で言い切る/, "ja: テストは 1 行言明");
      assert.match(doc, /上限は骨格に示した行数/, "ja: 行数規則");
      assert.match(doc, /分割.{0,40}で解消/, "ja: 超過は分割で解消");
    } else {
      assert.match(doc, /^### Preconditions/m, "en: Preconditions 小節");
      assert.match(doc, /List units in implementation order/, "en: 並び順 = 実装順");
      assert.match(doc, /condition \+ expected result/, "en: テストは 1 行言明");
      assert.match(doc, /cap is the line count shown in the skeleton/, "en: 行数規則");
      assert.match(doc, /splitting/i, "en: 超過は分割で解消");
    }
    assert.ok(!/given/i.test(doc), `${lang}: given/when/then の詳述形式が残っていない`);
    assert.ok(!doc.includes("depends_on"), `${lang}: depends_on が残っていない`);
    assert.match(doc, /test_command/, `${lang}: test_command の置き場`);
    assert.match(doc, /^## Backlog candidates/m, `${lang}: ## Backlog candidates`);
    if (lang === "ja") {
      assert.match(doc, /引用 1 行 \+ やりたいこと 1 行/, "ja: contract の行数形式");
    } else {
      assert.match(doc, /one citation line \+ one intent line/i, "en: contract の行数形式");
    }
    assert.match(doc, /EXTRACT_SCHEMA/, `${lang}: schema の所有者は build.js と明記`);
    assert.match(doc, /クロスチェック|cross-check/, `${lang}: 決定論クロスチェックへの言及`);
    assert.ok(!doc.includes("build-plan:v1"), `${lang}: build-plan:v1 残骸なし`);
    assert.ok(!doc.includes("<details>"), `${lang}: <details> 残骸なし`);
    assert.ok(!doc.includes("```json"), `${lang}: json fence 指定なし`);
  }
});

test("think SKILL.md の contract authoring 規則が選択 (引用ラダー) を強制している", () => {
  const ja = read(skills.ja);
  assert.match(ja, /生成でなく選択/, "ja: 選択 > 生成の原則");
  assert.match(ja, /コード片を新造/, "ja: コード片の新造禁止");
  assert.match(ja, /docs\/wiki/, "ja: wiki 引用");
  assert.match(ja, /公式 docs/, "ja: 公式 docs 引用");
  assert.match(ja, /SOURCING/, "ja: SOURCING.md の規律参照");

  const en = read(skills.en);
  assert.match(en, /Select, do not generate/, "en: selection over generation");
  assert.match(en, /invent new code fragments/i, "en: no invented code fragments");
  assert.match(en, /docs\/wiki/, "en: wiki 引用");
  assert.match(en, /official docs/i, "en: 公式 docs 引用");
  assert.match(en, /SOURCING/, "en: SOURCING.md の規律参照");
});

test("think SKILL.md の precondition 規則と書き出し前検証が stable anchor と実在検証を含む", () => {
  const ja = read(skills.ja);
  assert.match(ja, /既存.{0,10}依存先のみ/, "ja: 既存依存先のみ");
  assert.match(ja, /新規作成ファイル.{0,20}載せない/, "ja: 新規作成ファイルは載せない");
  assert.match(ja, /stable anchor/, "ja: stable anchor");
  assert.match(ja, /公開シンボル/, "ja: 公開シンボル名");
  assert.match(
    ja,
    /安定.{0,10}シンボルが無ければ.{0,10}path のみ/,
    "ja: 安定シンボルが無ければ path のみ",
  );
  assert.match(ja, /test -f/, "ja: test -f 実在検証");
  assert.match(ja, /ugrep -F/, "ja: ugrep -F 実在検証");
  assert.match(ja, /^### 書き出し前検証/m, "ja: 書き出し前検証の節");

  const en = read(skills.en);
  assert.match(en, /existing dependenc/i, "en: 既存依存先のみ");
  assert.match(en, /newly created/i, "en: 新規作成ファイルは載せない");
  assert.match(en, /stable anchor/i, "en: stable anchor");
  assert.match(en, /exported/i, "en: 公開シンボル名");
  assert.match(en, /path only/i, "en: path のみフォールバック");
  assert.match(en, /test -f/, "en: test -f 実在検証");
  assert.match(en, /ugrep -F/, "en: ugrep -F 実在検証");
  assert.match(en, /^### Pre-writeout verification/m, "en: 書き出し前検証の節");
});
