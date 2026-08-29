---
status: "proposed"
date: "2026-08-29"
decision-makers: "thkt"
---

# Adopt TypeScript for helper scripts

## Context and Problem Statement

ハーネスは 2 言語で動く。workflow script は JS で、それが呼ぶ helper script 143 本は Python である。境界の契約は手書きガードで、`workflows/code.js:118` が `gate.py` の JSON を `typeof report.verdict === "string"` だけで検査している。`.agents` が同じ構成を TypeScript 一本で組み、`contracts.ts` の型を出す側と読む側で共有していることが比較対象になった。

## Decision Drivers

- 契約が型として書けるか
- hook の起動コスト。hooks 47 本は毎ツール呼び出しで走る
- 移行の可逆性と、途中で止まったときの状態
- 配布先ランタイムの前提

## Considered Options

- Python のまま据え置く
- helper script を TypeScript へ段階移行する
- workflow script も含めて全面 TypeScript 化する

## Decision Outcome

Chosen option: "helper script を TypeScript へ段階移行する", because 起動コストが下がることを実測で確認でき、workflow script を含めない範囲であれば vm 境界に当たらないため。

### Consequences

- Good, because helper 同士が型を共有でき、契約が手書きガードから型へ移る
- Good, because hook 1 本あたりの起動が 34ms から 23ms へ下がる。`PreToolUse` の Bash matcher は 8 本あるので Bash 1 回あたり約 90ms 縮む
- Bad, because 移行中は Python と TypeScript が同居し、CI が ruff と型検査の両方を持つ
- Bad, because 実行に必要なランタイムの床が `python3` から Node 24 以上へ上がる

### Confirmation

`npx tsc --noEmit -p tsconfig.json` が CI で走り、移行済みパスを型検査する。`.ja` ミラーは EN 側とコメントを除いた本文が一致することをテストが確認する。移行が完了した層では、対応する `*_test.py` が存在しないことをもって確認する。

## Pros and Cons of the Options

### Python のまま据え置く

移行コストを払わず現状を維持する。

- Good, because 143 本を書き換えない
- Good, because 配布先に `python3` 以上の前提を課さない
- Bad, because JS と Python の境界が手書きガードのまま残る
- Bad, because hook の起動が 1 本あたり 11ms 遅いままになる

### helper script を段階移行する

葉のスクリプトから順に TypeScript へ移し、workflow script は JS のまま残す。

- Good, because 各段階が独立して着地し、途中で止めても両言語が動く状態を保てる
- Good, because 最初のスライスが 3 消費者しか持たない葉なので、手順を小さく確立できる
- Bad, because 移行中は CI が 2 言語分の lint と型検査を持つ

### 全面 TypeScript 化する

workflow script も TypeScript にする。

- Good, because 言語が 1 つになる
- Bad, because workflow script は `vm.compileFunction` で注入グローバル付きのコンテキストへ読み込まれ、import を持てない。型モジュールを共有できないので、狙いである契約の型共有がその継ぎ目には届かない

## More Information

### Migration Strategy

葉から順に、層ごとに移す。相互 import を持たない `workflows/**` の 11 本を最初のスライスにし、`workflows/_lib/gate.py` 1 本で手順を確立する。次が `skills/**` の 22 本、最後が `hooks/**` の 26 本で、`hooks/_lib` は fan-in 16 の塊なので依存する hook と同時に動かす。`plugins/` 配下の 45 本は追跡外の vendored なので対象に含めない。

### Rollback Plan

各スライスは 1 PR で着地し、revert 単位になる。移行済みスライスを戻す場合は、その PR を revert すれば Python 版が復帰する。全体を戻す判断が要る場合も、未移行の層は手つかずなので影響はスライス単位に閉じる。

### Success Criteria

- 移行済みパスが CI の型検査を通る
- 移行前後で helper script の CLI 契約が変わらない。第 1 スライスは Python 版と TypeScript 版の出力を突き合わせる差分テストで確認する
- hook 層の移行後、`PreToolUse` の Bash matcher 8 本の合計起動時間が移行前を下回る

### Reassessment Triggers

- 移行済み層で、型が防げたはずの不具合が 1 件も出ない状態が 2 スライス続く
- Node の型ストリップ仕様が変わり、`node --test` が `.test.ts` を直接扱えなくなる
- 配布を非目標から外す判断が出て、実行環境に Node 24 以上を要求できなくなる
- hook 層の移行後、実測した起動時間の改善が 1 本あたり 5ms を下回る
