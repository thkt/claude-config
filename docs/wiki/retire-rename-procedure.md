---
globs: []
---

# skill/agent の retire・rename 手順

## 内容

skill / agent / workflow を retire または rename するときは、使用実績の計測を根拠にし、両ツリー全域の残存参照ゼロを検証し、配布物 (marketplace.json) と docs を同期し、docs/decisions/ 内の言及は歴史記録として据え置く。PR 本文には retire で失われる検出層とその復活判断トリガーを明記する。

## 定型手順

1. 使用実績を計測して根拠表を作る。30日 spawn 回数 / audit findings 件数 / lint 代替可否 / セッションログ grep
2. EN と .ja の両ツリー + docs (COMMANDS.md / SKILLS_AGENTS.md) を一括更新し、git ls-files / ugrep 全走査で残存参照ゼロを確認する
3. `.claude-plugin/marketplace.json` と `docs/SKILLS_AGENTS.md` の件数を同期し、`python3 -m json.tool` で JSON を検証する
4. docs/decisions/ 内の言及は削除せず歴史記録として据え置く
5. PR 本文に弱点 (失われる検出層) と復活判断トリガーを明記する
6. 対象を扱う未着手 issue の有無を確認し、無効化されるものは close する

## 根拠

- #135 audit launcher skill を trigger 率 7% の計測を根拠に廃止した
- #138 30日 spawn 3 件 + audit findings 0 + lint 代替可否の表で reviewer-strictness を retire した
- #140 transcript 計測で実 spawn の最終日を特定して retire を正当化した
- #147 セッションログを grep して 0 呼び出しを確認し probe / prototype を retire した
- #165 issue-gate→veto rename で git ls-files 全走査により残存参照ゼロを検証した
- #173 agent 廃止で EN+.ja 削除、marketplace.json 除去、ADR supersede を一括実施した
- #142 復活判断トリガー (TS audit 取りこぼしの実例が出たら) を PR 本文に明記した
- #107 #110 #112 #123 #125 #127 対象が先に retire され、着手前の整列 issue 6 件が無効化された
- 現行コード: `.claude-plugin/marketplace.json` (単一 build plugin、DR-0083)、`docs/SKILLS_AGENTS.md`
