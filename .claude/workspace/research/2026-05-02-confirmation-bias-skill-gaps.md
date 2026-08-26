# Research: Confirmation Bias Skill Gaps

Generated: 2026-05-02
Intent: Understanding (skill gap analysis + change proposals)
Domain: General

## Purpose

Zenn 記事「『わからない』をAIに書かせる」(haru0416, 2026-05) が提示した三つの確証バイアス対策 (UNKNOWN を成果物化 / Disconfirming probe 必須化 / inconclusive・deferred 出口) に対し、~/.claude スキル群の現状ギャップを抽出する。確認した4つの構造的ギャップに対する具体的変更提案をDA (critic-design) で叩くための資料。

## Source Reference

- Zenn article: https://zenn.dev/haru0416/articles/5a5e83ffe5e78e
- Cited research: arxiv.org/abs/2603.18740 (LLM Security Code Review Confirmation Bias)
- Public skills repo (referenced): https://github.com/haru0416-dev/agent-skills

## Reviewed Surface

| File                                                                  | Read range | Purpose                                |
| --------------------------------------------------------------------- | ---------- | -------------------------------------- |
| skills/research/SKILL.md                                              | full       | UNKNOWN handling 確認                  |
| skills/research/templates/research.md                                 | full       | template 内の UNKNOWN 表現             |
| skills/think/SKILL.md                                                 | full       | 設計フローの全体構造                   |
| skills/think/templates/sow.md, spec.md                                | full       | SOW/Spec field の確定要求度            |
| skills/think/references/step-0-why-discovery.md                       | full       | Why 確定の Gate 強度                   |
| skills/think/references/step-2-5-design-exploration.md                | full       | Step 4 DA challenge 構造               |
| skills/think/references/step-7-8-document-generation.md               | full       | Quality Gate の "all filled" 要求      |
| skills/assert/SKILL.md                                                | full       | gate 3値モデル                         |
| skills/assert/references/phase-details.md                             | full       | Phase 3 Intent Assertion 構造          |
| skills/assert/references/adversarial.md                               | full       | Intent verdict rules (promote/exclude) |
| skills/assert/references/gate-decision.md                             | full       | Ready / Ready (caveat) / NotReady 定義 |
| skills/audit/SKILL.md                                                 | full       | challenger / verifier pipeline         |
| skills/challenge/SKILL.md                                             | full       | DA spawn 構造                          |
| agents/critics/critic-design.md, critic-audit.md, critic-evidence.md  | full       | verdict 多値性                         |

## Key Findings

| Priority | Finding                                                                | Source                                    |
| -------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| 1        | think SOW/Spec template が確定値前提 (UNKNOWN 表現なし)                | think/templates/sow.md:11-17, spec.md     |
| 2        | assert gate に "コードレベル inconclusive" 出口がない                   | assert/references/gate-decision.md:24-31  |
| 3        | critic-design の weakness 主張ごとの supporting/disconfirming 分離なし | agents/critics/critic-design.md:140-145   |
| 4        | critics agent 冒頭に「圧縮禁止」表明なし                               | agents/critics/critic-*.md (全共通)       |

## Gap Details

### Gap 1: think SOW/Spec の UNKNOWN サポート欠如

#### 現状

`skills/think/references/step-0-why-discovery.md:30-34`:

| Rule                       | Detail                                                              |
| -------------------------- | ------------------------------------------------------------------- |
| One question per message   | Attach recommended answer with reasoning                            |
| Codebase-first             | Explore instead of asking if codebase can resolve                   |
| Surface hypothesis         | State your Why reading; ask to confirm or correct                   |
| Offer contrasting framings | Present alternative readings to help user articulate what they mean |
| Challenge vague outcomes   | "improve UX" → for whom? measured how?                              |

Why が vague なら back-and-forth で詰める設計。placeholder 禁止。UNKNOWN は「会話で潰す」方向であり、「成果物として残す」方向ではない。

`skills/think/templates/sow.md:11-17` Why field 5項目:

| For           | Problem | Outcome | Urgency | Inaction cost |
| ------------- | ------- | ------- | ------- | ------------- |

全フィールド埋め前提。"Inaction cost" のように現時点で測れない値が、それっぽい説明で埋まる経路がある。

`skills/think/references/step-7-8-document-generation.md:18` Quality Gate: "5 fields all filled" を要求。

#### 提案

A. SOW Why field に UNKNOWN マーカー導入

```markdown
| Inaction cost | UNKNOWN — probe: ユーザーインタビュー / Issue tracker 履歴 |
```

B. step-0 Gate に追記

> 対話で詰めても出ない場合は UNKNOWN — probe: <検証手段> として残す。確定不要なフィールドのみ許容 (Outcome / Problem は対話必須維持)。

C. step-7-8 Quality Gate を "all filled, including UNKNOWN — probe: X" に緩和

#### 想定効果

- "Inaction cost" 等の捏造を防ぐ
- 下流 (SOW/Spec/実装) に「不明のまま」signal が届く
- 実装段階で「ここが UNKNOWN だったから前提が崩れる」を可視化

#### リスク

- UNKNOWN許容は think の哲学 (Why 確定 → Design 進行) と方向対立
- 全フィールド UNKNOWN許可で Why 不確定のまま実装に進む経路ができる
- 採用するなら「UNKNOWN許可フィールド限定」必須

#### 採用条件

Outcome / Problem は対話必須維持。UNKNOWN許可は Inaction cost / Urgency に限定。Step 5 (Design Composition) 進行ゲートとして「Outcome / Problem が UNKNOWN でない」を追加。

---

### Gap 2: assert gate のコードレベル inconclusive 欠如

#### 現状

`skills/assert/references/gate-decision.md:24-31`:

| Input  | Required for Ready                 | Required for Ready (caveat)                 |
| ------ | ---------------------------------- | ------------------------------------------- |
| Build  | pass (or skipped: no build script) | skipped (env failure at bootstrap Step 1-3) |
| Tests  | pass / no-runner                   | skipped (env failure at bootstrap Step 1-3) |
| Issues | 0                                  | 0                                           |

Ready (caveat) は Bootstrap Step 1-3 (環境失敗) 専用。

`skills/assert/references/adversarial.md:92-97` Intent Assertion verdict rules:

| Condition                                  | Verdict |
| ------------------------------------------ | ------- |
| Intent source contradicts test expectation | exclude |
| Otherwise (no source found, or confirms)   | promote |

Intent source が見つからない場合 = promote。「証拠が足りない」状態を強制 promote = NotReady 化。

これは記事の「inconclusive を出口として用意し、結論を強引に押し込まない」と真逆。「結論を出さなあかんと粘る」をハーネスが構造的に強制している。

#### 提案

B 案推奨 (A 案は Ralph Loop integration とぶつかる)。

B案: Ready (caveat) の caveat reason を構造化

```markdown
caveat reason ∈ { env_failure, intent_deferred, both }
```

- env_failure: bootstrap Step 1-3 fail (現状)
- intent_deferred: Phase 3 Intent Assertion で intent ambiguous な adversarial FAIL が N件以上 (e.g., N >= 1)

verdict rules を3値化:

| Condition                         | Verdict   |
| --------------------------------- | --------- |
| Intent source contradicts         | exclude   |
| Intent source confirms            | promote   |
| No intent source found            | defer     |

defer 件数が閾値超えなら gate = Ready (caveat: intent_deferred)。

A 案 (gate 4値化、Inconclusive 追加) は意味的に綺麗だが Ralph Loop の挙動 (PASS / continue) を見直す必要があり ADR 級の変更。

#### 想定効果

- LLM が「白黒付かない adversarial test」を強制 promote しなくて済む
- 人間レビュー前段階で「ここ判断保留」シグナルが出る
- adversarial test が「intent 不明だから promote」で false NotReady を作る経路を塞ぐ

#### リスク

- caveat 拡張で意味が曖昧化 (env failure と intent ambiguity が同じ caveat 値を共有)
- caveat reason の structured field 追加で Report template 改訂必要
- Ralph Loop は Ready (caveat) で continue なので影響小

#### 採用条件

caveat reason field を必須化。Report template の Gate row に reason 表示追加。adversarial.md の verdict rules を 2値 → 3値に変更。

---

### Gap 3: critic-design の supporting/disconfirming probe 分離なし

#### 現状

`agents/critics/critic-design.md:42-49` Challenge Framework と `:52-89` V1-V5 Viewpoint で「proposal 全体に対する反証」は構造化されている。

`:140-145` Output 例:

```markdown
| Viewpoint | Severity | Finding                                                           |
| --------- | -------- | ----------------------------------------------------------------- |
| V2        | high     | Section 3 claims single-tenant but section 5 references multi-org |
```

ここで weakness が出るが、「自分の weakness 主張に対する反証 probe」までは要求していない。critic-design 自身が「自分の指摘を支持する証拠ばかり集める」確証バイアスにハマる経路は塞がれていない。

#### 提案

Output table に supporting / disconfirming 列追加:

```markdown
| Viewpoint | Severity | Finding              | Supporting evidence            | Disconfirming probe                                |
| --------- | -------- | -------------------- | ------------------------------ | -------------------------------------------------- |
| V2        | high     | single-tenant claim  | section 5 references multi-org | tenant boundary check at sow.md:42 (search result) |
```

各 weakness に「自分の指摘がもし間違いなら何が観察されるか」を強制記入。

Validation Process Step 5 を分割:

| Step | Action                                                |
| ---- | ----------------------------------------------------- |
| 5a   | 各 weakness に対し supporting evidence を1つ集める    |
| 5b   | 各 weakness に対し disconfirming probe を1つ実行      |
| 5c   | disconfirming で flip した weakness は severity 下げる |

#### 想定効果

- critic-design 自身の確証バイアス (自分の指摘を支持する証拠だけ集める) を抑制
- 出力 weakness の severity 自己検証
- false positive な weakness を agent 自身が捨てられる

#### リスク

- 出力フォーマット 3列 → 5列で見やすさ低下
- agent timeout 増 (probe 検索分の Read/Grep 増加)
- Max 3 findings 制約と並立して probe 必須化なら、findings 数が減る経路もある (probe で flip して捨てられる)

#### 採用条件

Max 3 findings 維持。probe 必須化で findings が減るのは設計通り (FP 減少)。timeout は 8 分制約内に収まる想定 (深掘りより広掘り)。

---

### Gap 4: critics agent 冒頭に「圧縮禁止」表明なし

#### 現状

`critic-design.md`, `critic-audit.md`, `critic-evidence.md` の冒頭は Purpose と Posture のみ。LLM が「冗長な工程を圧縮する誘惑」に対する明示的ガードなし。

記事の文言:

> This skill is selected for evidence, not speed or token economy. Do not compress away Defense, disconfirming probes, or Decision just to be brief.

#### 提案

各 critic agent の Posture セクション末尾に追加:

```markdown
This agent is selected for evidence, not speed. Do not compress viewpoints, probes, or verdict reasoning to be brief. Token economy is not a constraint here.
```

#### 想定効果

- LLM の自然な圧縮ドリフトに明示的ガード
- 各 critic で「冗長と判断したらこっそり省く」経路を塞ぐ
- 1ファイル1行追加で済む軽い変更

#### リスク

- ほぼなし。文言追加のみ
- 既存の banned phrasing と整合 (両方とも「LLM の自然な逃避」を塞ぐ機能)

#### 採用条件

そのまま採用可。Gap 3 と同時導入で probe 必須化が圧縮されない保証になる。

---

## Cross-Cutting Observation

4ギャップは独立に見えて、根は1つ。

LLM の確証バイアスを構造的に抑えるには、出力フォーマット (template / verdict 値) に直接「不確定状態の出口」を埋め込む必要がある。

うちのスキル群の現状:

| 層       | 不確定の表現                                                                | bubble up      |
| -------- | --------------------------------------------------------------------------- | -------------- |
| 上位     | think SOW/Spec, assert gate                                                 | 表現手段なし   |
| 中位     | research findings に "unknown, requires X"                                  | 部分表現あり   |
| 下位     | critic verdict (needs_revision / weak_evidence / unverifiable / disputed)   | 表現あるが孤立 |

不確定が下位 verdict に閉じ込められて上位 decision に届いていない。記事の発想は「下位の不確定を上位に bubble up させる」設計。

## Adoption Order Recommendation

| 順 | Gap | 理由                                                          |
| -- | --- | ------------------------------------------------------------- |
| 1  | 4   | コスト最小、効果即時。先に入れて他 Gap 採用時の保険になる     |
| 2  | 3   | critic-design 出力品質直撃、ADR 不要                          |
| 3  | 1   | think 哲学との整合検討必要、UNKNOWN許可フィールド限定で導入可 |
| 4  | 2   | Report template 改訂、ADR 級。優先度低くないが工数最大        |

## Disconfirmation Check

採用に対する反証 (記事の skill が誤って魅力的に見える可能性):

| 反証候補                                                       | 結果                                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 記事は単一ユーザの観察、効果検証は引用論文 (arxiv 2603.18740) | 論文側で 16-93% 検出率変動の定量化あり。記事の方向は論文裏付けあり                  |
| うちは既に critic agents で multi-verdict 持つ                | 持っているが上位 (gate / SOW) に bubble up していない (Gap 2 が示す)              |
| Disconfirming probe は YAGNI                                  | 該当しない。critic-design は production agent で確証バイアスは観測済み挙動         |

## Next Steps

| Step | Action                                                          |
| ---- | --------------------------------------------------------------- |
| 1    | DA (critic-design) でこの提案文書を叩く                          |
| 2    | DA 結果反映                                                     |
| 3    | 採用案を skill ファイルに反映 (別セッション)                    |
| 4    | Gap 2 採用前に ADR 起票 (Report template 改訂、Ralph Loop 影響) |
