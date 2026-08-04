---
status: "accepted"
date: 2026-05-31
decision-makers: thkt
---

# ADR-0025: ralph-loop を退役しネイティブ /goal を採用

## Context and Problem Statement

2026-03-16 時点でこの ADR は「3つの Stop hook を gates 1つに統合する」構想として提案された。3つの hook は completion-gate.sh (bash, lint/type/test)、gates (Rust, knip/tsgo/madge)、ralph-loop (plugin, prompt 再送) だった。

ralph-loop 固有の問題は、completion-promise を agent 自身が self-declare して loop を抜ける点にある。ralph-loop.md の CRITICAL RULE は「条件が完全に TRUE のときのみ promise を出力せよ」と誠実さで牽制するが、判定主体が agent 自身である構造は変わらない。これは「gate 判定に LLM の self-confidence を使わない」運用原則に反する。

2026-05-12 リリースの Claude Code 2.1.139 でネイティブの `/goal` スラッシュコマンドが追加され、状況が変わった。`/goal` は completion condition を満たすまで複数ターン自動継続し、ターン終了後に別の small fast model (デフォルト Haiku) が会話内容から達成を yes/no 判定する。判定主体が実行 agent から分離されており、ralph-loop の self-declare 問題を構造的に解消する。

`/goal` の登場で元 ADR のバンドルは分割される。ralph-loop の reprompt loop は `/goal` で置き換え可能だが、completion-gate.sh と gates の基盤統合、phase 判定、Review Gate 強制は `/goal` では解決しない。この ADR は前者に絞り、後者を残課題として分離する。

## Decision Drivers

- 完了判定の主体を実行 agent から分離する (self-confidence gate の排除)
- 自作保守コストの回避 (ネイティブ機能で代替できるなら作らない)
- ralph-loop の stop_hook_active 未チェックによる hook chain 競合の解消
- 既存ワークフロー (/code の RGRC Green Phase 反復) との互換性

## Considered Options

### Option A: ralph-loop 温存

- Good: 変更ゼロ
- Bad: self-declare completion 問題が残る。stop_hook_active 競合も残る

### Option B: 自作 flow-controller を gates に統合 (旧 Decision Outcome)

- Good: 完了判定 + phase 判定 + gate 統合を単一 Rust バイナリで制御
- Bad: 保守コスト大。`/goal` がネイティブで提供する機能を再実装することになる

### Option C: ネイティブ /goal を採用

- Good: 判定主体が分離 (Haiku)。自作保守ゼロ。ralph-loop を素直に退役できる
- Bad: 会話に出力された情報のみで判定 (後述)。/code 文脈での実効性は未検証

## Decision Outcome

Option C: ネイティブ /goal を採用。ralph-loop プラグインを退役する。

### Rationale

1. `/goal` の判定主体 (Haiku) は実行 agent と分離されており、self-confidence gate を排除する運用原則に沿う
2. 自作 flow-controller (Option B) が提供しようとした「completion condition まで反復」機能を、ネイティブが保守コストゼロで提供する
3. ralph-loop が消えれば 3 hook が 2 hook (completion-gate.sh + gates) になり、stop_hook_active 未チェック競合が解消する

### /goal の仕様要点

- 設定は `/goal <completion condition>` (最大 4000 文字)
- 動作は条件を満たすまで複数ターン自動継続
- 判定はターン終了後に small fast model (デフォルト Haiku) が会話内容から yes/no 評価
- 状態は `/goal` で確認、`/goal clear`/`stop`/`cancel` で解除
- 制限として会話に出力済みの情報のみで判定。ファイル読込やコマンド実行の独立検証はしない

## Scope Narrowing

元 ADR が含んでいた以下は `/goal` では解決しない。別 ADR 候補として分離する。

| 残課題                                                            | /goal が解決しない理由                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| completion-gate.sh と gates の gate 基盤重複排除                  | /goal は何も実行せず gate 重複に関与しない                          |
| phase 判定 (gate fail / all-pass-prev-block / all-pass-prev-pass) | /goal は単一の completion condition のみで phase ロジックを持たない |
| Review Gate の仕組みレベル強制                                    | /goal は review ステップを強制しない                                |

これらが依然必要かは ralph-loop 退役後に別途判断する。

## Consequences

### Positive

- 完了判定が self-declare から別モデル判定に変わる
- 自作 flow-controller の実装・保守が不要
- ralph-loop 退役で 3 hook が 2 hook になり stop_hook_active 競合が解消

### Negative

- この ADR は ADR-first で書かれ、`/goal` の /code 文脈での実効性は未検証 (下記 Verification Pending)
- `/goal` は会話テキストからのみ判定し自分では何も実行しない。/code の「テスト pass」gating には、テスト出力が会話に現れている必要がある。実際にコマンドを走らせる gates とは実質的に異なる
- `/goal` のターン継続と Stop をブロックする gates hook の相互作用は未検証。両者が同時に作用したときの挙動は不明

### Neutral

- ralph-loop プラグインは settings.json で無効化するが削除しない (ロールバック可能)
- gates 統合・phase 判定・Review Gate 強制は残課題として別 ADR 候補に送る

## Verification Results

2026-05-31 に対話セッションで `/goal` を実走した (最小プロジェクト: 1 失敗テストのバグ修正タスク)。

| 項目                        | 結果                                                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1 `/goal` の完了判定       | 確認。`✔ Goal achieved (1 turn)` で別モデルが node --test の pass を会話出力から判定し正常終了                                                                  |
| Q2 gates × `/goal` 競合     | 限定確認。1 turn 完了のため competing stop は発生せず、デッドロック・エラーなし。複数ターン要する競合場面は未観察                                               |
| ネスト `claude -p` での検証 | 不適。CLAUDE_CODE_SUBPROCESS_ENV_SCRUB ハードニングで権限が default 強制され検証にならず。対話実行が必要だった                                                  |
| 記述更新                    | 完了。skills/code・code-workflow・README・COMMANDS・settings.json と /assert 系 (gate-decision・assert・reviewer-spec・enhancer-evidence) を /goal ベースに移行 |

Q1 が実証されたため accepted とする。Q2 の competing stop は単純ケースで未発生にとどまり、完全検証は残課題。accepted を支える根拠は設計上の low-risk ではなく回復可能性にある。競合が起きてもデッドロックは可視的に hang し (silent corruption でない)、`/goal clear` と disable-not-delete のロールバック (ralph-loop:true + git revert) で復旧できる。加えて、書き換えた docs を使う実 `/code` の end-to-end 実行は未検証で、最初の実走が真の証明になる。今回の検証は `/goal` という機構の確認であり、編集した SKILL.md/code-workflow.md を通した artifact の確認ではない。

## Links

- /goal 公式 docs: <https://code.claude.com/docs/en/goal>
- Claude Code 2.1.139 リリース (2026-05-12) で /goal 追加
- 旧 SOW (flow-controller 自作前提): ~/.claude/workspace/planning/2026-03-16-flow-controller/sow.md
- completion-gate spec: ~/.claude/workspace/planning/2026-03-10-completion-gate/spec.md
