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

test("テンプレートの root_cause 見出し語が build.js の検査対象フィールド名と一致する", () => {
  const buildJs = readFileSync(join(root, "workflows", "build.js"), "utf8");
  // validate() が Bug の plan で実際に読むキーを起点にする。schema の description に
  // 当てると、英文言を書き換えただけでフィールドを見失い、検出したいトークンのずれと
  // 無関係な理由でこの seam テストが壊れる。
  const fieldMatch = buildJs.match(/isBug\s*&&\s*!String\(plan\.(\w+)\s*\|\|/);
  assert.ok(fieldMatch, "build.js の validate から Bug 限定必須フィールドの名前を読める");
  const fieldName = fieldMatch[1];
  const headingToken = new RegExp(`^${fieldName}:`, "m");
  for (const [lang, path] of Object.entries(templates)) {
    const doc = read(path);
    assert.match(
      doc,
      headingToken,
      `${lang}: root_cause 見出し語 ${fieldName} が build.js の検査対象フィールド名と一致する`,
    );
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

test("各言語のテンプレートが reference_module を kind と理由の形で示す", () => {
  for (const [lang, path] of Object.entries(templates)) {
    const doc = read(path);
    assert.match(doc, /reference_module: \{kind/, `${lang}: reference_module 行が kind から始まる`);
    assert.match(
      doc,
      /module\/no-module\/new-shape/,
      `${lang}: kind enum が build.js の (module/no-module/new-shape) と揃う`,
    );
  }
});

test("各言語のテンプレートが Bug タスク用の root_cause 行を持つ", () => {
  for (const [lang, path] of Object.entries(templates)) {
    const doc = read(path);
    assert.match(
      doc,
      /^Outcome:.*\n^root_cause:/m,
      `${lang}: root_cause が Outcome の直後に置かれている`,
    );
    assert.match(doc, /Bug/, `${lang}: root_cause が Bug タスク限定と説明されている`);
  }
});

test("think SKILL.md の precondition 規則と書き出し前検証が stable anchor と実在検証を含む", () => {
  const ja = read(skills.ja);
  assert.match(ja, /既存.{0,10}依存先のみ/, "ja: 既存依存先のみ");
  assert.match(ja, /新しく作るファイル.{0,20}載せない/, "ja: unit が新しく作るファイルは載せない");
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

test("各言語の SKILL.md が Bug タスクで原因と根拠を問う規則を持つ", () => {
  const ja = read(skills.ja);
  assert.match(ja, /Bug/, "ja: Bug タスクへの言及");
  assert.match(ja, /Bug[\s\S]{0,150}原因/, "ja: Bug 文脈で原因を問う");
  assert.match(ja, /原因[\s\S]{0,60}根拠|根拠[\s\S]{0,60}原因/, "ja: 原因と根拠がセットで問われる");

  const en = read(skills.en);
  assert.match(en, /Bug/, "en: Bug task mention");
  assert.match(en, /Bug[\s\S]{0,150}(root cause|cause)/i, "en: asks the cause in Bug context");
  assert.match(
    en,
    /(root cause|cause)[\s\S]{0,80}(evidence|basis|grounds)|(evidence|basis|grounds)[\s\S]{0,80}(root cause|cause)/i,
    "en: cause and evidence asked together",
  );
});

test("各言語の SKILL.md が原因未確定の Bug を research へ回す分岐を持つ", () => {
  const ja = read(skills.ja);
  assert.match(ja, /原因.{0,20}(未確定|不明)/, "ja: 原因未確定の判定条件");
  assert.match(
    ja,
    /(未確定|不明)[\s\S]{0,150}\/research|\/research[\s\S]{0,150}(未確定|不明)/,
    "ja: 原因未確定を /research へ回す分岐",
  );

  const en = read(skills.en);
  assert.match(
    en,
    /cause[\s\S]{0,20}(undetermined|unclear|unknown)/i,
    "en: undetermined-cause condition",
  );
  assert.match(
    en,
    /(undetermined|unclear|unknown)[\s\S]{0,150}\/research|\/research[\s\S]{0,150}(undetermined|unclear|unknown)/i,
    "en: routes undetermined-cause Bug to /research",
  );
});

test("各言語の SKILL.md が reference_module の探索を設計の承認より前に置く", () => {
  const ja = read(skills.ja);
  const jaPhase2Start = ja.indexOf("## Phase 2");
  const jaCriticLaunch = ja.indexOf("`critic-design` を起動する");
  assert.ok(
    jaPhase2Start !== -1 && jaCriticLaunch !== -1,
    "ja: Phase 2 と critic-design 起動行が存在する",
  );
  const jaRefSearch = ja.indexOf("reference_module", jaPhase2Start);
  assert.ok(
    jaRefSearch !== -1 && jaRefSearch < jaCriticLaunch,
    "ja: reference_module の探索が critic-design 起動より前に書かれている",
  );

  const en = read(skills.en);
  const enPhase2Start = en.indexOf("## Phase 2");
  const enCriticLaunch = en.indexOf("Launch `critic-design`");
  assert.ok(
    enPhase2Start !== -1 && enCriticLaunch !== -1,
    "en: Phase 2 and critic-design launch line exist",
  );
  const enRefSearch = en.indexOf("reference_module", enPhase2Start);
  assert.ok(
    enRefSearch !== -1 && enRefSearch < enCriticLaunch,
    "en: reference_module search precedes critic-design launch",
  );
});

test("各言語の SKILL.md が探索結果を kind と理由で記録する規則を持つ", () => {
  const ja = read(skills.ja);
  assert.match(ja, /kind/, "ja: kind による記録");
  assert.match(ja, /module\/no-module\/new-shape/, "ja: kind enum が module/no-module/new-shape");
  assert.match(
    ja,
    /kind[\s\S]{0,80}理由|理由[\s\S]{0,80}kind/,
    "ja: kind と理由がセットで記録される",
  );

  const en = read(skills.en);
  assert.match(en, /kind/, "en: recorded by kind");
  assert.match(
    en,
    /module\/no-module\/new-shape/,
    "en: kind enum matches module/no-module/new-shape",
  );
  assert.match(
    en,
    /kind[\s\S]{0,80}reason|reason[\s\S]{0,80}kind/i,
    "en: kind and reason recorded together",
  );
});

test("各言語のテンプレートに実機確認見出しが Backlog candidates の直前に存在する", () => {
  for (const [lang, path] of Object.entries(templates)) {
    const doc = read(path);
    const headingToken = lang === "ja" ? "### 実機確認" : "### Manual verification";
    const headingMatch = doc.match(new RegExp(`^${headingToken}.*$`, "m"));
    assert.ok(headingMatch, `${lang}: ${headingToken} 見出しが存在する`);
    const afterHeading = doc.slice(headingMatch.index + headingMatch[0].length);
    const nextHeadingMatch = afterHeading.match(/^#{2,3}[ \t].*$/m);
    assert.ok(nextHeadingMatch, `${lang}: 実機確認見出しの後に別の見出しが続く`);
    assert.strictEqual(
      nextHeadingMatch[0].trim(),
      "## Backlog candidates",
      `${lang}: 実機確認見出しの直後の見出しが Backlog candidates`,
    );
  }
});

test("受け入れテストの bullet は T-NNN のみで実機確認の bullet と混ざらない旨がガイドラインに存在する", () => {
  const ja = read(templates.ja);
  assert.match(
    ja,
    /T-NNN[\s\S]{0,150}実機確認[\s\S]{0,60}混ざら|実機確認[\s\S]{0,150}T-NNN[\s\S]{0,60}混ざら/,
    "ja: 受け入れテストの bullet が T-NNN のみで実機確認の bullet と混ざらない旨のガイドライン",
  );

  const en = read(templates.en);
  assert.match(
    en,
    /T-NNN[\s\S]{0,150}Manual verification[\s\S]{0,60}mix|Manual verification[\s\S]{0,150}T-NNN[\s\S]{0,60}mix/i,
    "en: guideline stating acceptance-test bullets are T-NNN only, not mixed with manual-verification bullets",
  );
});

test("各言語の SKILL.md に test_command で実行できない基準の実機確認委譲規則が存在する", () => {
  const ja = read(skills.ja);
  const jaPhase3 = ja.slice(ja.indexOf("## Phase 3"), ja.indexOf("## 出力"));
  assert.match(
    jaPhase3,
    /test_command[\s\S]{0,120}実行できない[\s\S]{0,150}実機確認|実機確認[\s\S]{0,150}test_command[\s\S]{0,120}実行できない/,
    "ja: test_command で実行できない基準を実機確認へ委譲する規則",
  );
  assert.match(jaPhase3, /実機確認[\s\S]{0,40}(委譲|送る)/, "ja: 実機確認への委譲先の明記");
  const jaVerification = jaPhase3.slice(jaPhase3.indexOf("### 書き出し前検証"));
  assert.match(jaVerification, /実機確認/, "ja: 書き出し前検証に実機確認への対応項目がある");

  const en = read(skills.en);
  const enPhase3 = en.slice(en.indexOf("## Phase 3"), en.indexOf("## Output"));
  assert.match(
    enPhase3,
    /test_command[\s\S]{0,120}cannot[\s\S]{0,150}[Mm]anual verification|[Mm]anual verification[\s\S]{0,150}test_command[\s\S]{0,120}cannot/,
    "en: routes criteria test_command cannot execute to Manual verification",
  );
  assert.match(
    enPhase3,
    /[Mm]anual verification[\s\S]{0,40}(delegat|route|send)/i,
    "en: delegation destination named",
  );
  const enVerification = enPhase3.slice(enPhase3.indexOf("### Pre-writeout verification"));
  assert.match(
    enVerification,
    /[Mm]anual verification/i,
    "en: pre-writeout verification covers manual verification routing",
  );
});

test("各言語の SKILL.md にフィールド描画 unit の T-NNN フィールド列挙規則が存在する", () => {
  const ja = read(skills.ja);
  const jaPhase3 = ja.slice(ja.indexOf("## Phase 3"), ja.indexOf("## 出力"));
  assert.match(
    jaPhase3,
    /ドメイン.{0,10}フィールド[\s\S]{0,20}描画/,
    "ja: ドメインフィールドを描画する unit への言及",
  );
  assert.match(
    jaPhase3,
    /(表示フィールド|描画)[\s\S]{0,80}T-NNN|T-NNN[\s\S]{0,80}(表示フィールド|描画)/,
    "ja: 表示フィールドを T-NNN に列挙する規則",
  );

  const en = read(skills.en);
  const enPhase3 = en.slice(en.indexOf("## Phase 3"), en.indexOf("## Output"));
  assert.match(
    enPhase3,
    /domain field[\s\S]{0,20}render|render[\s\S]{0,20}domain field/i,
    "en: mention of a unit rendering domain fields",
  );
  assert.match(
    enPhase3,
    /(displayed field|rendered field)[\s\S]{0,80}T-NNN|T-NNN[\s\S]{0,80}(displayed field|rendered field)/i,
    "en: rule enumerating displayed fields as T-NNN",
  );
});
