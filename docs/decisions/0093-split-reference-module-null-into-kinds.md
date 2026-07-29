---
status: "accepted"
date: "2026-07-30"
decision-makers: thkt
---

# DR-0093: reference_module の null を kind (module/no-module/new-shape) に分ける

## Context and Problem Statement

`workflows/build.js:233` の PLAN_SCHEMA で `reference_module` は `type: ["object", "null"]` であり、null のとき理由や種別を格納するフィールドを持たない。`skills/think/templates/plan.md:15` のテンプレートは `null + この形が新規である理由` を 1 行で書く形式だが、`workflows/build.js` の extract prompt (`:290-300` 付近) は preconditions/backlog_candidates/assumptions/seam には触れているのに reference_module には触れておらず、抽出は理由を落として単なる null に潰す。

open な Plan 付き issue 3 件、#281 `reference_module: null (既存 skills/scribe/SKILL.md への追補で新規モジュールを作らない...)`、#272 `reference_module: null (既存 skill の軸表への 1 行追加で新規モジュールを作らない)`、#271 `reference_module: null (既存 skill の様式追補で新規モジュールを作らない)` は、いずれも「既存ファイルへの追補でモジュールを作らない」型である。この型は「そもそも参照すべき新規モジュールが存在しない」という主張であり、`skills/think/SKILL.md:53` が定義する reference_module の本来の null、すなわち「先行事例のない新しい形」とは中身が異なる。前者は「参照先を探す必要が無い」、後者は「探したが無かった」であり、後者だけが構造の手組みドリフトのリスクを持つ。両方が同じ null に潰れているため、build 側でこの 2 つを区別して扱えない。

## Decision Drivers

- 開いている Plan 付き issue 3 件 (#281/#272/#271) が全て「モジュール非生成」型で null を使っており、この型が既に実データの主流である
- 「モジュール非生成」と「新形で先行事例なし」は意味が異なる。前者は探索が不要、後者は探索したが見つからなかったという主張であり、混同すると null の理由検査も反証も的を外す
- `reference_module: null` を厳格な必須理由フィールド付き object に置き換えると、現行の主流入力である素の null が schema 違反になり、回復経路が blockers 文言を持たない `extraction-failed` だけになる
- `skills/think` の SKILL.md と templates/plan.md は本 DR の対象外 (#287 の Premises)。extract 側が既存書式 `null (理由)` から kind を導く後方互換で動かす必要がある

## Considered Options

- Option A: `reference_module` の型を `["object", "null"]` のまま残し、object 形に `kind` (`module`/`no-module`/`new-shape`) と `reason` を持たせる。素の null は互換入力として許容し続ける
- Option B: `reference_module` を常に object 必須にし、null を廃止する。`kind: "no-module"` 等を必須フィールドにして null 自体を無くす
- Option C: 現状維持。null は 1 種類のまま、prose 上の理由だけで区別する

## Decision Outcome

Option A を採用する。型を variant に分けるのではなく、`["object", "null"]` という既存の外形を保ったまま object 側にだけ `kind` を持たせることで、後方互換 (素の null も引き続き通る) と区別可能性 (object を渡せば kind で意味を明示できる) を両立できるため。

`kind` は 3 値とする。`module` は既存の同形モジュールを実際に参照する本来の用途で、`path` と `files` を要求する。`no-module` は #281/#272/#271 が示す「既存ファイルへの追補でモジュールを作らない」型で、reason のみを要求し path は求めない。`new-shape` は「先行事例のない新しい形」で、これも reason のみを要求する。`no-module` と `new-shape` を分けるのは、両者とも reason 必須である点は同じだが、前者は「探索不要」、後者は「探索したが無かった」という異なる主張であり、将来 F4 の反証探索 (#287 Backlog candidates、`new-shape` のとき reviewer-reuse に同形モジュールの不在を検査させる案) を実装する際に `new-shape` だけを対象にできる必要があるため。`no-module` を対象に含めると、そもそも探索が要らない大多数の追補型 unit にまで無駄な反証コストが掛かる。

Option B は null という表現自体を無くすため区別は最も明確になるが、素の null を使う既存の think 側の出力形式 (`reference_module: null (理由)`) と、それを前提に書かれている open な Plan 3 件が全て schema 違反になる。extract 側の変換ロジックだけでは救えず、`skills/think` の SKILL.md と templates/plan.md も同時に変える必要が生じ、#287 の Premises が明示する不可侵領域に触れる。

### Consequences

- Good, because「モジュール非生成」と「新形で先行事例なし」を kind で区別でき、reason 必須化の検査 (#287 U-002) と将来の反証探索 (F4) の両方が正しい対象だけに掛かる
- Good, because 型が `["object", "null"]` のまま残るので、素の null を書く既存の think 側の出力と #281/#272/#271 を含む現行の open な Plan が schema 違反にならない
- Bad, because kind が 3 値に増える分、extract prompt と validate の分岐が増え、`null (理由)` という prose 形式から kind を機械的に導く変換ロジックの保守が要る
- Bad, because `no-module` と `new-shape` の境界は prose の書き方に依存する。「既存ファイルへの追補」であっても実質的に新しい構造を持ち込む unit は、書き手の申告次第でどちらの kind にもなりうる

### Confirmation

`workflows/build.js` の PLAN_SCHEMA で `reference_module` が `type: ["object", "null"]` のままであり、object 側に `kind` (`module`/`no-module`/`new-shape`) と `reason` のプロパティを持つこと。`node --test workflows/build/tests/build.behavior.test.js workflows/build/tests/handoff-contract.test.js` が green であること。

## Pros and Cons of the Options

### Option B: null を廃止し常に object 必須にする

`reference_module` を必須の object にし、null という表現自体を無くす。

- Good, because 型定義上 null という無情報値が存在しなくなり、kind の指定漏れが構造的に起きない
- Bad, because 現行の think 側の出力形式 `null (理由)` と、それに従う open な Plan 3 件 (#281/#272/#271) が全て schema 違反になり、回復経路が `extraction-failed` しか無くなる
- Bad, because `skills/think` の SKILL.md と templates/plan.md の同時改修が必要になり、#287 の Premises が定める不可侵領域に触れる

### Option C: 現状維持。null は 1 種類のまま

null を区別せず、prose 上の理由文字列だけで意味を書き分け続ける。

- Good, because schema もコードも変更が要らない
- Bad, because build 側が null の中身を検査できない。理由の無い null と理由付きの null を機械的に区別できず、#287 W2/F3 が指摘する決定論ガードの欠落が残る
- Bad, because 将来の反証探索 (F4) を実装する際、対象を `new-shape` だけに絞る手段が無く、`no-module` 型にも同じ検査が掛かってコストが膨らむ

## More Information

### Before / After comparison

| 項目                   | Before                                     | After                                                     |
| ---------------------- | ------------------------------------------ | --------------------------------------------------------- |
| reference_module の型  | `["object", "null"]`                       | `["object", "null"]` (変化なし)                           |
| null の意味の区別      | 1 種類 (モジュール非生成と新形が同じ null) | object の kind で `module`/`no-module`/`new-shape` を区別 |
| 素の null の互換性     | 唯一の入力形式                             | 引き続き許容 (extract が `null (理由)` から kind を導く)  |
| 理由の無い null の検査 | できない                                   | #287 U-002 で validate が止める対象になる                 |

### Transition Plan

本 DR は判断の記録のみを担う (#287 U-001)。実装は #287 の後続 unit が担う。

1. U-002: PLAN_SCHEMA の `reference_module` object 側に `kind` と `reason` を追加し、`validate()` に理由の無い null/kind が `module` で path が空/kind が `module` 以外で reason が空、を止める検査を足す
2. U-002: extract prompt に既存書式 `null (理由)` から kind を導く指示を追加する
3. U-003: `kind: "module"` の `path` と `files` を revalidate の payload に足し、実在検査を script 側に持たせる

### Reassessment Triggers

- `no-module` と `new-shape` の境界判定が prose 依存であることが実害として現れる。同じ性質の unit が書き手によって異なる kind を名乗り、validate や反証探索の対象選定を誤らせたとき
- F4 (`new-shape` に対する reviewer-reuse 反証探索) を実装する段になり、3 値では足りない区別が要ることが分かったとき
