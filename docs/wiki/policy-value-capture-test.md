---
globs: ["**/workflows/**/*.js"]
scenes: []
---

# policy 値を behavioral capture テストで固定する

## 内容

agent へ渡す effort と model は、ファイルごとの定数を読むテストでなく、実際に走らせて渡った値を捉えるテストで固定する。定数を読むテストは、定数が残ったまま呼び出し側が値を渡さなくなっても緑のままになる。

## 定型手順

1. workflow を実行し、agent 呼び出しへ渡った effort と model を捉える
2. 期待値をテスト側へ書き写さず、渡った値そのものを検査する
3. 呼び出し側から値を落として、テストが落ちることを確認する

## 参照コード

- `workflows/code/tests/code.model.test.js`（`input.model` が Red / Green の実装 agent だけへ届き、その agent が effort high で走ることを捉える）
- `workflows/audit/tests/audit.effort.test.js`（audit の各段へ渡る effort を捉える）
- `workflows/polish/tests/polish.effort.test.js`（polish の各段へ渡る effort を捉える）

## 根拠

- #191 workflows の effort policy を per-stage へ一本化し、xhigh を verify / judge 段のみに絞る起票
- #192 その実装。xhigh を critic-* 系のみに限定した
- #199 build の sibling を dev-tree 優先へ反転し、stale plugin の shadow を防いだ
- #223 code workflow の実装 agent へ no-advisor constraint を追加した
- #224 audit の critic 層を opus から sonnet へ切り替える trial
