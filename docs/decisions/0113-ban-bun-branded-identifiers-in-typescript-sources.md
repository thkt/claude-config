---
status: "accepted"
date: "2026-09-01"
decision-makers: "thkt"
---

# Ban bun-branded identifiers in TypeScript sources

## Context and Problem Statement

DR-0112 が始めた TypeScript への段階移行で、helper が node と bun のどちらでも動く状態を保つ必要がある。#606 の設計中に測った値では、hook 層で python3 (24.6ms) を下回るランタイムは bun (14.7ms) だけで、node は `node -e ''` の空プロセスだけで 30.4ms を要する。可搬性はいつか要るかもしれない選択肢ではなく、その層の移行が成立する唯一の条件になる。

一方で CI は node で走る。`npx tsc` の型検査も `node --test` のスイートも node が実行するので、bun でしか動かない API を書いたコードは CI で落ちる。

**この規律をどの検査も拾っていなかった。** `.oxlintrc.json` に `no-restricted-globals` も `no-restricted-imports` も無く、`Bun.file()` や `import ... from "bun:test"` を書いてもスイートは緑のまま通る。DR-0112 の本文にも `bun` の語は現れない。

## Decision Drivers

- 規律が破れたことに気づく手段が要る
- 規律の根拠と、外してよい条件が読める場所が要る
- `workflows/*.js` は vm で評価される workflow script で、この規律の対象外

## Considered Options

- `.oxlintrc.json` に `**/*.ts` の override を 1 つ足す
- `rules/` に散文で規律を置く
- `gate.ts --help` からフラグ一覧を生成するように、規律も実行時に導出する

## Decision Outcome

Chosen option: "`.oxlintrc.json` に `**/*.ts` の override を 1 つ足す", because 検査が決定論で走り、CI の `npx oxlint` がそのまま執行の場になるため。

規則は 2 つ。`no-restricted-globals` が `Bun` グローバルを、`no-restricted-imports` が `bun:*` の specifier を落とす。グローバルだけでは `bun:test` などモジュール経由の依存が別経路で漏れる。

### Consequences

- Good, because bun 印の識別子が `.ts` に入った時点で `npx oxlint` が非ゼロで終わる
- Good, because 層が増えても override は 1 つのまま。`**/*.ts` が `skills/**` と `hooks/**` の移行先も覆う
- Bad, because 落とすのは bun 印の識別子だけで、`import fs from "fs"` も `import chalk from "chalk"` も通る。規律の名前より狭い
- Bad, because 形で判定するので `globalThis.Bun.env` と `globalThis["Bun"].file()` と `require("bun:sqlite")` は捕まらない

### Confirmation

`workflows/tests/oxlint-runtime-discipline.test.js` が repository の `.oxlintrc.json` を temp directory へ写し、違反する `.ts` を書いて実 oxlint を走らせる。捕まる 2 形と、捕まらない 3 形の両方を固定する。CI は `npx oxlint` を repository root で素に走らせる。

## Pros and Cons of the Options

### `.oxlintrc.json` に `**/*.ts` の override を 1 つ足す

lint 設定が規律を執行する。

- Good, because CI に既にある `npx oxlint` がそのまま検査になる
- Good, because 違反の位置と理由が診断メッセージに出る
- Bad, because 規則の根拠が設定ファイルに書けない。この記録がその置き場になる

### `rules/` に散文で規律を置く

書かれた規律を人と agent が読む。

- Good, because 規律の意図を字数の制約なく書ける
- Bad, because 執行が読み手任せになり、破れても緑のまま通る
- Bad, because lint 設定と散文の 2 箇所が同じ規律を持ち、drift する

### 規律を実行時に導出する

禁止する識別子の一覧を実行側の定数から生成する。

- Good, because 一覧が 1 箇所になる
- Bad, because 導出元になる定数がどこにも無い。bun の API 一覧は bun 側が持つもので、この repository には無い

## More Information

### Migration Strategy

規則は着地と同時に全 `.ts` へ掛かる。着地時点の tracked `.ts` に違反は無いので、移行期間を置かない。

### Rollback Plan

override 1 つの追加なので、その要素を消せば元に戻る。

### Success Criteria

- `Bun` グローバルか `bun:*` specifier を含む `.ts` を tracked file として置くと CI が落ちる
- `skills/**` と `hooks/**` の移行で override を足す必要が出ない

### Reassessment Triggers

- ランタイムを bun へ切り替える判断が出て、bun 印の識別子を書くことが正になる
- 形で判定する現在の規則を抜ける違反が実際に混入する。`globalThis.Bun` 経由と `require("bun:*")` が既知の穴
- node が bun と同等の起動時間になり、可搬性を保つ理由が消える
- oxlint が `no-restricted-globals` か `no-restricted-imports` を落とす

### 関連する記録

- DR-0112 Adopt TypeScript for helper scripts。段階移行そのものを決めた記録。この記録はそこに無かった規律を足すもので、supersede ではない
- `rules/conventions/DOCUMENTS.md` の Routing 1 が、規則を `rules/` に、その根拠を決定記録に置くと定める。ここでは規則を `.oxlintrc.json` が決定論で執行するので、`rules/` に散文の写しを置かない。写しは drift するため
