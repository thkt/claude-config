---
status: "proposed"
date: 2026-03-24
decision-makers: thkt
---

# ADR-0033: shields に Recursive Unwrap Stack を追加

## Context and Problem Statement

shieldsのcommand guardはnormalize（N1-N7難読化解除）+ 44 regexパターンの表層マッチで動作している。`sudo env bash -c "rm -rf /"` のようなwrapper経由のコマンドは、内側の `rm -rf` が全文に出現するため「たまたま」拾えているが、パターンにないコマンドがwrapper内にある場合（`sudo bash -c "cat /etc/shadow > /tmp/leak"`）は素通りする。また `bash -c "$(evil)"` のような動的生成コマンドも検知できない。

omamori v0.6.0がRecursive Unwrap Stackとして公開した設計（wrapper再帰剥がし + shell launcher内側抽出 + compound splitting + 動的生成fail-close）をshieldsに取り入れる。

## Decision Drivers

- 現行の「偶然カバー」を構造的検査に置換する必要性
- omamori v0.6の設計が公開され、参考実装が利用可能
- security toolはfail-closeを優先すべき
- shieldsのminimalist設計方針（4 deps, ~2700行）を維持したい

## Considered Options

### Option 1: normalize.rs に N8/N9 を追加（Pragmatist）

既存のnormalizeパイプラインにwrapper strip（N8）とshell launcher extract（N9）を文字列変換として追加。compound splittingはやらない。

- Good: 変更量が小さい（+50行）、新依存なし
- Bad: compound splittingなし（`bash -c 'echo ok && rm -rf /'` の内側分割不可）
- Bad: N1（quote strip）が先に走るため、shell launcherの引数境界が消える
- Bad: 再帰的ネストに対応できない
- Bad: DA指摘「N1順序依存がフラジャイル」が未解決

### Option 2: 新 unwrap モジュール + shell-words + normalize 2フェーズ化（採用）

normalizeをdecode phase（構造保持）とstrip phase（構造破壊）に分離し、新unwrapモジュールをdecode後に挿入。shell-words crateでPOSIX準拠のトークン化。

- Good: DA指摘（N1 × shell-wordsの構造衝突）を構造的に解決
- Good: 引用符内の `&&` を分割しない（quote-aware splitting）
- Good: 再帰対応（depth limit付き）
- Good: pipe-to-shellを構造的に検出（regex依存しない）
- Good: defense in depth（既存normalize + 全文マッチをフォールバック維持）
- Bad: 新依存 `shell-words` 追加（ただし0-dependency crate）
- Bad: +250行、normalizeのAPI変更あり
- Bad: fail-close閾値（segments > 20）のfalse positiveリスク

### Option 3: omamori をそのまま採用（shields 廃止）

omamoriのshim + hookを利用し、shieldsのcommand guardを廃止。

- Good: 実装不要
- Bad: shieldsのACL・secrets検知・custom patternが失われる
- Bad: omamoriはshimベースで設計思想が異なる
- Bad: shieldsのhookエコシステム（guardrails, formatter, gates）との統合が壊れる

## Decision Outcome

Option 2: 新unwrapモジュール + normalize 2フェーズ化。

### normalize 2フェーズ化

| Phase | Transforms | 性質 |
|---|---|---|
| decode | N7 (ANSI-C), N5 (indirection), N6 (backslash), N3 (IFS) | 構造を壊さずに難読化を解除 |
| strip | N1 (quotes), N4 (braces), N2 (cmd sub) | 構造を破壊する変換（unwrap 後に実行） |

### パイプライン

```text
oneline
  → decode (N7, N5, N6, N3)
  → unwrap (shell-words tokenize → compound split → wrapper strip → shell launcher extract → recurse)
  → per-segment: strip (N1, N4, N2) → pattern match
  + fallback: full normalize (全 N1-N7) → pattern match on 全文
```

### 構造的検出（unwrap 内）

| 検出 | 条件 | 結果 |
|---|---|---|
| pipe-to-shell | `\|` 分割後のセグメントが bare shell | BLOCK |
| dynamic generation | shell launcher 内側に `$(...)` or backtick | BLOCK |
| depth exceeded | 再帰 > 5 | BLOCK |
| too many tokens | > 1000 | BLOCK |
| too many segments | > 20 | BLOCK |
| input too large | > 1MB | BLOCK |

## Technical Details

| Decision | Choice | Rationale |
|---|---|---|
| トークナイザ | `shell-words` crate | POSIX 準拠、0 deps、引用符処理を自前で書かない |
| unwrap の位置 | decode の後、strip の前 | 引用符を保持した状態で構造パース |
| compound split | unwrap 内で quote-aware | DA 指摘の N1 順序依存を回避 |
| 既存パイプライン | フォールバックとして維持 | defense in depth |
| cross-segment 検出 | 構造的（unwrap 内） | regex では pipe 分割後に検知不可 |
| stderr 改善 | hint 行追加 + 経路表示 | omamori の UX を参考 |

## Links

- shields source: ~/GitHub/cli/shields/
- omamori: <https://github.com/yottayoshida/omamori>
- omamori v0.6記事: <https://zenn.dev/yottayoshida/articles/omamori-plugging-holes-v050-v060>
- shell-words crate: <https://crates.io/crates/shell-words>
- DA challenge 1: wrapperカバーは「たまたま拾えてるだけ」
- DA challenge 2: N1がshell-wordsに必要な構造を破壊する
- DA challenge 3: per-segmentマッチがcross-segmentパターンを壊す
