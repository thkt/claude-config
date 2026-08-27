# Research: scribe-setup-ja-canonical-mirror

Generated: 2026-07-12
Session: 1e72b5f8-0db3-48e9-8321-aab18be14c52
Intent: Feature planning
Domain: General
Prior research: 2026-07-10-scribe-mechanism-cleanup (related chore, SETUP.md dedup; kept /scribe-setup SKILL.md out of scope)

## Purpose

untracked の JA スキル `skills/scribe-setup/SKILL.md` を ADR-0073 の .ja canonical ミラー運用に正式組込するための材料を、既存ミラー済みペア (fix/commit/checkout) の実例と ADR-0073 / MARKDOWN.md / skills loader snapshot 仕様の file:line から確定する。実装はしない。

## Key Findings

| Priority      | Finding                                                                                                                                                                                                                                                                                                            | Source                                                                                                            | Next Action                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| High (Q1)     | ミラー済みペアで `description` のみ翻訳される。fix/commit/checkout とも .ja 側は日本語散文、EN 側は英訳。`name` `allowed-tools` `model` `argument-hint` は両ファイルでバイト等価の構造リテラル                                                                                                                     | .ja/skills/fix/SKILL.md:3-7 vs skills/fix/SKILL.md:3-7 / commit :2-8 両側 / checkout :2-7 両側                    | scribe-setup も description を英訳、他フィールドは同一に保つ                                                                         |
| High (Q1)     | `when_to_use` のトリガー句は EN ミラーでも日本語のまま。3 ペアすべて `when_to_use` が JA↔EN で完全一致 (`バグ修正, 直して...` / `コミットして...` / `ブランチ作成...`)。翻訳しない                                                                                                                                 | fix 両側 :4 / commit 両側 :4 / checkout 両側 :4                                                                   | EN 側 when_to_use に JA トリガー句をそのまま置く                                                                                     |
| High (Q1)     | 本体は title + 散文を翻訳、table 構造・bash/git コードブロック・パス・enum 値は構造リテラルとして同一。scribe-setup 本体 (L31-34, 42-44, 50-52) は `mkdir/cp/gh label/run.sh` のコマンドとパスのみで、これらは両側で同一に保つ対象                                                                                 | skills/fix/SKILL.md 本体 vs .ja 対応 / skills/scribe-setup/SKILL.md:31-52                                         | 本体の散文 (L18,20,24-27,36,40,44,48,54) を英訳、コードブロックは複製                                                                |
| High (Q4)     | 現 scribe-setup frontmatter はローカル skill 規約に非準拠。`description: >` folded scalar に description と `Use when...` トリガーを混載、`allowed-tools` を YAML block list、`user-invocable: true` (デフォルト値を明示)、`when_to_use`/`model`/`argument-hint` 欠落                                              | skills/scribe-setup/SKILL.md:3-13 vs reference_skill-frontmatter-rules memory / fix・commit・checkout 実例        | 組込時に description/when_to_use 分離、allowed-tools を space 区切り化、user-invocable:true 削除。model/argument-hint 追加は任意判断 |
| High (Q2)     | ADR-0073 の不変条件のうち本 chore に効くのは 2 点: (1) 同一コミット規律 = JA と EN を同一コミットで両更新、(2) 構造的英語リテラル = example markdown ブロック・table ヘッダ・enum 値は .ja でも英語のまま                                                                                                          | docs/decisions/0073-...:52-53                                                                                     | .ja canonical 作成と EN 書換を 1 コミットに束ねる。bash ブロックは .ja でも英語                                                      |
| High (Q2)     | MARKDOWN.md File scope: `.ja/` canonical、`.ja/` を先に編集し `.ja/` 接頭辞を除いたパス (`skills/scribe-setup/SKILL.md`) へ同一コミットでミラー。skills/\*\* は LLM-facing scope                                                                                                                                   | rules/conventions/MARKDOWN.md § File scope                                                                        | canonical = `.ja/skills/scribe-setup/SKILL.md`、mirror = `skills/scribe-setup/SKILL.md`                                              |
| High (Q3)     | skill 一覧はセッション開始時 snapshot。compaction を跨ぐか新セッションでのみ再 snapshot。セッション途中の frontmatter 変更は現セッションに反映されない (probe 実測: 途中作成 skill は作成直後 Unknown、compaction 後に起動可)                                                                                      | projects/-Users-thkt--claude/memory/reference_fork-skill-hooks.md:16                                              | 組込後の `/scribe-setup` invoke と新 when_to_use トリガーの auto-discovery 検証は新セッションで行う                                  |
| Med (Q3)      | `.ja/skills/` は 2 つ目の skill discovery root ではない。creating `.ja/skills/scribe-setup/SKILL.md` は重複 skill を生まない。cross-method 確認: fix/commit/checkout は `.ja/skills/<n>/SKILL.md` と `skills/<n>/SKILL.md` を両持ちだが loaded skill list に各 1 回のみ出現。loader の flat root は `skills/` のみ | loaded available-skills list (fix/commit/checkout/scribe-setup 各 1 回) / reference_skill-discovery-spec.md:10-14 | 追加時に重複懸念なし。invoke 名は `name: scribe-setup` 維持で不変                                                                    |
| Med (Q4)      | 対象ファイル現状: `skills/scribe-setup/SKILL.md` = 54 行 (wc -l。タスク記載「55 行」との差 1 は行末改行由来)、JA 内容、git untracked (`?? skills/scribe-setup/`)。`.ja/skills/scribe-setup/` 不在。scribe/SETUP.md:22 が `/scribe-setup` を参照                                                                    | git status --porcelain / wc -l / scribe/SETUP.md:22 / ls .ja/skills/scribe-setup (不在)                           | JA を .ja へ移し EN を英訳新規作成、同一コミットで両追加                                                                             |
| Med (Q4)      | branch `chore/scribe-setup-organization` が現ブランチ。ただし main より先の唯一のコミット 57e5fc0b は build ephemeral plan で scribe-setup と無関係。scribe-setup ファイルは未コミット (untracked のまま)                                                                                                          | git branch --show-current / git log chore/scribe-setup-organization -5 / git status                               | この branch 上で JA+EN を 1 コミットに束ねればよい                                                                                   |
| Low (context) | 先行 research 2026-07-10-scribe-mechanism-cleanup は SETUP.md 重複削除 chore で `/scribe-setup` SKILL.md を「不可侵」と明記。本 chore はその補集合 (先行が触れなかった skill 本体を扱う)。SETUP.md:22 の `/scribe-setup` ポインタは name 不変なら有効なまま                                                        | workspace/research/2026-07-10-scribe-mechanism-cleanup.md:44,70                                                   | 先行 chore と衝突なし。name を変えないこと                                                                                           |

## Available Data

| Type     | Item                                                                  | Note                                                                                     |
| -------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| File     | `skills/scribe-setup/SKILL.md` (54 行)                                | 組込対象。JA 内容、untracked、frontmatter 非準拠                                         |
| File     | `.ja/skills/scribe-setup/SKILL.md`                                    | 不在。canonical として新規作成する                                                       |
| Pair     | `.ja/skills/{fix,commit,checkout}/SKILL.md` + `skills/{...}/SKILL.md` | ミラー実例。description 翻訳・when_to_use 同一の参照基準                                 |
| Doc      | `docs/decisions/0073-adopt-ja-as-canonical-source-for-mirror.md`      | 同一コミット規律・構造リテラル不変条件 (L52-53)                                          |
| Doc      | `rules/conventions/MARKDOWN.md` § File scope                          | .ja canonical / 同一コミットミラー / skills=LLM-facing                                   |
| Doc      | `scribe/SETUP.md:22`                                                  | `/scribe-setup` への唯一のポインタ (name 不変が要件)                                     |
| Memory   | `reference_skill-frontmatter-rules.md`                                | frontmatter 統一ルール (description/when_to_use 分離、space 区切り、user-invocable 省略) |
| Memory   | `reference_fork-skill-hooks.md:16`                                    | skill snapshot はセッション開始時、compaction で再 snapshot                              |
| Memory   | `reference_skill-discovery-spec.md:10-14`                             | loader は flat `skills/` root のみ、subdir 非認識                                        |
| Research | `workspace/research/2026-07-10-scribe-mechanism-cleanup.md`           | 先行 chore。SKILL.md を out of scope とした                                              |

## Constraints

| Category         | Constraint                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mirror           | `.ja/` canonical、EN は同一コミットでミラー (OUTCOME.md:20 / ADR-0073:52 / MARKDOWN.md § File scope)                                              |
| Literal          | 構造的英語リテラル (bash ブロック・パス・table ヘッダ・enum) は .ja でも英語のまま (ADR-0073:53)                                                  |
| Frontmatter      | ローカル skill 規約に準拠: description/when_to_use 分離、allowed-tools space 区切り、user-invocable:true 削除 (reference_skill-frontmatter-rules) |
| Invoke stability | invoke 名 `/scribe-setup` を維持 = `name: scribe-setup` 不変 (scribe/SETUP.md:22 が依存)                                                          |
| Verification     | 組込後の invoke / auto-discovery 検証は新セッションで行う (skill snapshot 仕様、fork-skill-hooks:16)                                              |
| Scope            | 材料集めのみ。実装しない                                                                                                                          |

## Disconfirmation Check

Prior research の存在確認は初回スキャンで tool 誤用 (`.claude/workspace/research` と誤ったパス接頭辞) により 0 hit だった。正しいパスで再スキャン:

```
$ bfs workspace/research -iname '*scribe*'
workspace/research/2026-07-10-scribe-mechanism-cleanup.md
```

`.ja/skills/` が 2 つ目の skill root として重複 skill を生む反証確認。ミラー済みペアが両側ファイルを持つのに loaded skill list に 1 回しか出ないことを cross-method で確認:

```
$ ls .ja/skills/fix/SKILL.md skills/fix/SKILL.md   # 両方存在
.ja/skills/fix/SKILL.md
skills/fix/SKILL.md
# loaded available-skills list では `fix` `commit` `checkout` `scribe-setup` が各 1 回のみ出現
```

両側ファイルが存在しても skill list に重複が出ないため、「`.ja/skills/` は discovery root ではない」を確定。よって `.ja/skills/scribe-setup/SKILL.md` の新規作成は重複 skill を生まない。

現状の git tracking 確認 (0 hit を実不在と区別):

```
$ git status --porcelain skills/scribe-setup/ .ja/skills/scribe-setup/
?? skills/scribe-setup/
$ git ls-files skills/scribe-setup/    # (空 = untracked 確定)
$ ls .ja/skills/scribe-setup/          # .ja/skills/scribe-setup absent
```

## References

| Path                                                                     | Description                                         |
| ------------------------------------------------------------------------ | --------------------------------------------------- |
| docs/decisions/0073-adopt-ja-as-canonical-source-for-mirror.md           | .ja canonical 転換 ADR。不変条件 table L50-54       |
| rules/conventions/MARKDOWN.md                                            | File scope (mirror 手順) / Symbols / Do not         |
| .ja/skills/fix/SKILL.md, skills/fix/SKILL.md                             | ミラーペア実例 (description 翻訳・when_to_use 同一) |
| .ja/skills/commit/SKILL.md, skills/commit/SKILL.md                       | 同上                                                |
| .ja/skills/checkout/SKILL.md, skills/checkout/SKILL.md                   | 同上                                                |
| skills/scribe-setup/SKILL.md                                             | 組込対象 (54 行、JA、untracked)                     |
| scribe/SETUP.md                                                          | L22 が `/scribe-setup` を参照                       |
| projects/-Users-thkt--claude/memory/reference_fork-skill-hooks.md        | skill snapshot 仕様 (session start / compaction)    |
| projects/-Users-thkt--claude/memory/reference_skill-frontmatter-rules.md | frontmatter 統一ルール                              |
| projects/-Users-thkt--claude/memory/reference_skill-discovery-spec.md    | loader flat root 仕様                               |
| workspace/research/2026-07-10-scribe-mechanism-cleanup.md                | 先行 chore (SETUP.md dedup)                         |

## Coverage Notes

- Q1-Q4 全て回答済み。unknown 残なし。
- explorer-feature スキップ: Intent=Feature planning だが対象は markdown ミラー chore で実行経路が存在せず、全対象ファイルを逐語 read 済み。先行 research (同 Intent) の同一判断を踏襲。
- 「55 行」対「54 行」の差 1 は行末改行由来で実害なし。行数はどちらでも組込判断に影響しない。
- cross-method 一致: skill 重複懸念は loaded list 観測と discovery-spec memory の 2 方法で一致。tool 不一致なし。
- 未確認: 現 scribe-setup が `model` を持たない (fix=opus, commit/checkout=haiku)。組込時に model を付けるかは gh/codex を回す setup skill の性質を踏まえたユーザー判断。research 上の欠落ではない。
- Advisor: unavailable (ツールがこのセッションで利用不可のため呼べず)。代替として全対象ファイル (fix/commit/checkout 両側・scribe-setup・ADR-0073・MARKDOWN.md) を逐語 read 済みで、findings は全て file:line か loaded skill list 観測に紐付く。

## Next Steps

| Intent           | Next Command                                              |
| ---------------- | --------------------------------------------------------- |
| Feature planning | `/think` または `/issue` (chore を build workflow に渡す) |
