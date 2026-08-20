---
status: "superseded by DR-0099"
date: "2026-08-18"
decision-makers: thkt
---

# ADR-0077: fix の finding ID routing を severity で gate し audit→fix ループを閉じる

## Context and Problem Statement

fix の audit 直結モードは `/^SUG-[0-9]+$/` で SUG-NNN を受けて RCA を省く fast path だった。だが現行の snapshot schema (finding-schema.md) は SUG prefix を廃し、findings[] は RC / SEC 等 21 prefix を `severity` (critical/high/medium/low) と `fix_type` (auto/manual) 付きで出す。fix SKILL.md と GLOSSARY.md の SUG-NNN 参照は drift であり、SUG を finding ID へ素朴に置換すると critical な SEC- finding が RCA も regression test 生成も省く fast path に落ちる。これは TESTING.md の「monetary loss / unauthorized access / data loss は regression-first」に反する build 品質の退行を生む。加えて build Phase 7 は audit (Step 2) と fix (Step 3) を別々に呼ぶだけで、finding ID が両者を繋いでいなかった。

## Decision Drivers

- SUG-NNN drift の解消 (fix / GLOSSARY の live reference が現行 schema と不一致)
- 素朴な regex 置換が critical/high を fast path に乗せる退行リスク
- audit が出した root cause を fix が再利用せず、ループが閉じていない

## Considered Options

- Option 1: fast path は `fix_type: auto` かつ severity low/med のみ。critical/high は full protocol
- Option 2: RC- prefix は severity を問わず fast path、他 prefix は Standard Flow

## Decision Outcome

Option 1 を採用する。

### routing rule

fix の Finding ID モードは finding の severity と fix_type で経路を分ける。fast path は RCA と regression test 生成の双方を省くため、誤修正コストの低い finding に限定する。

| finding                                    | 経路                                                         |
| ------------------------------------------ | ------------------------------------------------------------ |
| `fix_type: auto` かつ severity low/med     | fast path で直接修正 (RCA スキップ。audit root cause を信頼) |
| それ以外 (critical/high、または auto 以外) | full protocol。audit root cause を 5 Whys の入力に再利用     |
| ID が snapshot に不在                      | エラー提示 + Standard Flow                                   |

### audit→fix ループの閉鎖

build Phase 7 Step 3 を `Skill("fix", "<ID>")` に変え、Step 2 snapshot の critical/high finding ID を渡す。fix はそれを受けて full protocol を回し、audit の root cause を 5 Whys 入力に再利用する。finding ID が audit と fix を繋ぐ単一の参照になる。

### Consequences

- Good, critical/high は finding ID 経由でも必ず regression-first で修正され build 品質の退行を防ぐ
- Good, audit root cause が fix に渡り、同じ分析を二度しない
- Bad, fast path の対象が狭まり low/med の auto fix 以外は full protocol のコストを払う。これは退行防止の対価として受容する

### Confirmation

routing の severity gate は snapshot schema の `severity` / `fix_type` enum を key にし、決定論的に分岐する。build Phase 7 の finding ID 受け渡しでループ閉鎖を確認する。

## Pros and Cons of the Options

### Option 1 (severity で gate)

- Good, critical/high の regression-first を保証する
- Good, fix_type:auto を尊重し schema と整合する
- Bad, 経路が2分岐になり説明コストがかかる

### Option 2 (prefix で gate)

- Good, ルールが prefix 単一で単純
- Bad, RC- に high severity が付いた場合 fast path に乗り退行を招く。severity を見ないため schema の安全弁を捨てる

## More Information

SUG-NNN は audit-2026-04-06 snapshot まで実在した audit 出力 ID (workspace/delta, workspace/planning に `/fix SUG-001` の実使用あり)。これらは executed history として不変。本 ADR は live reference (fix SKILL.md, GLOSSARY.md) のみ修正し、history は触れない。ADR-0050 (fix の skill 委譲統合) の Transition Plan に残る SUG- も executed history として据え置く。

### References

- ADR-0050 (fix を skill 委譲へ統合。Transition Plan で SUG- routing を codify)
- ADR-0047 (audit snapshot 制度)
- snapshot-schema.md / finding-schema.md (severity / fix_type enum, ID prefix registry)
- rules/development/TESTING.md (critical/high は regression-first)
