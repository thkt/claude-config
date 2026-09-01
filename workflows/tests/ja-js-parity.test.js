// An EN and .ja workflow script pair must carry the same code. Prose differs by design (prompts,
// comments, log lines), so both sides are tokenized with acorn and every string, template, and
// regex literal collapses to one placeholder before the token streams are compared. What is
// left is identifiers, punctuation, and structure, so a fix landing on one side alone fails here
// while a retranslated prompt does not.
//
// Three normalizations keep formatting and language out of the comparison. A comma right before
// a closer is dropped (prettier's trailing-comma choice). `"a" + "b"` collapses to one string (a
// sentence split for line length on one side only). The `${}` expressions of one string are
// compared as a sorted set, because a translated sentence can legitimately mention the same
// values in another order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tokenizer } from "acorn";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STRING = "<string>";
const SEP = "␟";
const STRINGISH = new Set(["string", "regexp"]);
const CLOSERS = new Set([")", "]", "}"]);

const isStr = (t) => typeof t === "string" && t.startsWith(STRING);
const groupsOf = (t) => (t.length > STRING.length ? t.slice(STRING.length + 1, -1).split(SEP) : []);
const strToken = (groups) =>
  groups.length ? `${STRING}{${groups.slice().sort().join(SEP)}}` : STRING;

const append = (target, text) => {
  if (CLOSERS.has(text) && target.length && target[target.length - 1] === ",") target.pop();
  if (
    isStr(text) &&
    target.length >= 2 &&
    target[target.length - 1] === "+" &&
    isStr(target[target.length - 2])
  ) {
    target.pop();
    const prev = target.pop();
    target.push(strToken([...groupsOf(prev), ...groupsOf(text)]));
    return;
  }
  target.push(text);
};

export function codeTokens(source) {
  const out = [];
  // One frame per open template literal: `current` holds the tokens of the `${}` expression
  // being read (null while inside the literal text), `groups` the finished expressions.
  const frames = [];
  const target = () => {
    for (let i = frames.length - 1; i >= 0; i--) if (frames[i].current) return frames[i].current;
    return out;
  };
  const opts = { ecmaVersion: "latest", sourceType: "module", allowHashBang: true };
  for (const tok of tokenizer(source, opts)) {
    const label = tok.type.label;
    const top = frames[frames.length - 1];
    if (label === "`") {
      if (top && !top.current) {
        frames.pop();
        append(target(), strToken(top.groups));
      } else {
        frames.push({ current: null, groups: [], depth: 0 });
      }
      continue;
    }
    if (label === "template") continue;
    if (label === "${") {
      top.current = [];
      top.depth = 0;
      continue;
    }
    if (top && top.current) {
      if (label === "{") top.depth++;
      if (label === "}") {
        if (top.depth === 0) {
          top.groups.push(top.current.join(" "));
          top.current = null;
          continue;
        }
        top.depth--;
      }
    }
    const text = STRINGISH.has(label)
      ? STRING
      : tok.value === undefined
        ? label
        : String(tok.value);
    append(target(), text);
  }
  return out;
}

const firstDiff = (en, ja) => {
  let k = 0;
  while (k < en.length && k < ja.length && en[k] === ja[k]) k++;
  const around = (t) => t.slice(Math.max(0, k - 6), k + 8).join(" ");
  return `token ${k}\n  en: ${around(en)}\n  ja: ${around(ja)}`;
};

const scripts = readdirSync(join(root, "workflows")).filter((f) => f.endsWith(".js"));

test("every workflow script has a .ja mirror", () => {
  const missing = scripts.filter((f) => !existsSync(join(root, ".ja", "workflows", f)));
  assert.deepEqual(missing, []);
});

for (const name of scripts) {
  test(`${name}: the EN and .ja scripts carry the same code once prose is removed`, () => {
    const en = codeTokens(readFileSync(join(root, "workflows", name), "utf8"));
    const ja = codeTokens(readFileSync(join(root, ".ja", "workflows", name), "utf8"));
    assert.ok(en.length > 100, `${name}: the EN side tokenizes (${en.length} tokens)`);
    assert.equal(en.join("\n"), ja.join("\n"), `${name}: code differs at ${firstDiff(en, ja)}`);
  });
}

// The comparison must fail on code drift and pass on prose drift, or it swings at nothing.
test("a differing identifier fails and a differing prompt passes", () => {
  const base = (word, prose) =>
    `const ${word} = 1;\nlog(\`${prose} \${a} and \${b}\`, "x", 'y');\nreturn { a: ${word}, };\n`;
  assert.notEqual(
    codeTokens(base("alpha", "hello")).join(),
    codeTokens(base("beta", "hello")).join(),
  );
  assert.equal(
    codeTokens(base("alpha", "hello")).join(),
    codeTokens(base("alpha", "こんにちは")).join(),
  );
  // A translated sentence may reorder the values it mentions, and may split or join the
  // string pieces that carry them.
  const reordered = `log(\`\${b} then \${a}\`);\n`;
  const straight = `log(\`\${a} then \` + \`\${b}\`);\n`;
  assert.equal(codeTokens(reordered).join(), codeTokens(straight).join());
  // Splitting a string for line length is not code drift.
  assert.equal(codeTokens(`f("a" + "b");`).join(), codeTokens(`f("ab");`).join());
  // A value dropped from a prompt is code drift.
  assert.notEqual(codeTokens(`f(\`\${a} \${b}\`);`).join(), codeTokens(`f(\`\${a}\`);`).join());
  // Regex literals after `(` and `=` are literals, not division.
  assert.equal(
    codeTokens(`const r = /a\\/b/g; f(/x/);`).join(),
    codeTokens(`const r = /c/; f(/y/i);`).join(),
  );
});
