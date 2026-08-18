---
status: "accepted"
date: 2026-06-18
decision-makers: thkt
---

# ADR-0076: framework コードの source-driven discipline 採用

## Context and Problem Statement

AI が framework や library の API コードを学習データの記憶から書くと、pin したバージョンと乖離した古い、あるいは誤った API を生成する (version drift)。この incident は単発ではなく繰り返し発生している。

CLAUDE.md の Verify ルール「事実は出典を引用」は原則として存在するが、framework コードを書く瞬間 (write-time) の具体的手順には落ちていない。harness の現状を見ると非対称がある。

| skill     | lifecycle | source の扱い                                                         |
| --------- | --------- | --------------------------------------------------------------------- |
| /research | verify    | Phase 3 close で library API claim を公式 docs (`scout fetch`) で検証 |
| /code     | write     | Execution に framework API を書く前の source 取得 step が存在しない   |

drift bug が生まれるのは write-time の /code 側であり、ここに穴が開いている。

### ADR-0071 との区別

「source」という語が ADR-0071 と重なるが、扱う軸は別である。

| ADR  | source の意味                                                              | 対象                             |
| ---- | -------------------------------------------------------------------------- | -------------------------------- |
| 0071 | 判断の根拠が見つからない状態 (確証バイアス、rationale 欠如) のルーティング | think / assert の no-source 出口 |
| 0076 | framework 挙動の権威ある出典 (pin バージョンの公式 docs)                   | /code の framework コード生成    |

ADR-0071 は judgment-basis の routing、本 ADR は framework-behavior の authority。直交する。

## Decision Drivers

- version-drift incident が繰り返し発生している (実需。外部 pack の主張ではなく自 harness の incident が駆動因)
- CLAUDE.md の Verify 原則が framework コード生成の write-time に具体化されていない
- 同一知識 (framework 挙動の正は pin バージョンの公式 docs) が /code (write) と /research (verify) の 2 lifecycle で必要。重複させず単一ホームに置きたい

## Considered Options

- Option A: /code にインライン discipline を追記する (rule file なし)
- Option B: rules/development/SOURCING.md を単一知識ホームにし、/code が write-time に参照、/research が既存 verify から cross-link する
- Option C: 何もせず CLAUDE.md の Verify 原則に委ねる

## Decision Outcome

Option B を採用する。

### 核

framework や library の API を書くときは、記憶からではなく pin バージョンの公式 docs を fetch して書き、出典 URL をコードまたはコミットに残す。手順は DETECT (framework API を書こうとしている) から FETCH (pin バージョンの公式 docs を引く)、IMPLEMENT、CITE (出典を残す) の 4 段。

この知識は単一ファイル rules/development/SOURCING.md に置く。/code は write-time に適用し、/research は Phase 3 close の既存 primary-source verification から同じ知識を verify-time に適用する。同一知識を 2 つ書かず、lifecycle の違いだけを各 skill が持つ。

### Consequences

- Good, write-time の source 取得で version-drift bug が減る
- Good, framework-behavior authority の知識が単一ホームになり DRY
- Bad, fetch コストが write 時に乗る。DETECT で framework API を書く局面に限定して緩和する

### Confirmation

rules/development/SOURCING.md の作成、/code Execution への write-time step 追加、/research Phase 3 close からの cross-link で閉じる。drift incident が再発した場合は SOURCING.md の DETECT 条件を見直す。

## More Information

- addyosmani/agent-skills の source-driven-development を inspiration として参照したが、論拠は自 harness の recurring incident に置く。pack の主張単独は load-bearing にしない
- CLAUDE.md Verify ルール「事実は出典を引用」の write-time 具体化にあたる
- ADR-0071 (no-source 状態の routing。本 ADR と軸が別であることを上記で明示)

### Reassessment Triggers

- write 時の fetch コストが DETECT 限定でも許容できなくなったとき
- pin バージョンの公式 docs が参照できない framework を扱う段になったとき
