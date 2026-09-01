---
status: "proposed"
date: "2026-09-01"
decision-makers: "thkt"
---

# Justify the hooks TypeScript migration by the type contract

## Context and Problem Statement

DR-0112 は helper script 全体の TypeScript 段階移行を、型契約の共有と起動コストの両方を根拠に決めた。起動コストの根拠は「stdin JSON + ローカル import を持つ現実的な hook 形が python3 で 34ms、TypeScript ファイルで 23ms」という当時の見積もりだった。

issue #606 の設計中に実測すると値が違った。python3 は 24.6ms、`node -e ''` の空プロセスだけで 30.4ms、bun は 14.7ms である（DR-0113 に記録済み）。node は python3 より遅く、hooks 層に node をそのまま採ると `PreToolUse` の Bash matcher 8 本の合計起動時間は移行前を下回るどころか悪化する。DR-0112 の Success Criteria が要求する「移行前を下回る」を node だけでは満たせない。

一方で settings.json は hook を絶対パスのシェバン経由で直接起動し、PATH は truncated である（`hooks/_lib/tests/shebang_test.py`、#534）。ランタイムを切り替えるなら、そのシェバンが指す先も同じ制約を満たす必要がある。

hooks 層の移行を続けるなら、根拠を起動コストから型契約へ置き直すか、起動コストを満たす別のランタイムを採るかを決める必要がある。

## Decision Drivers

- 契約を型として共有できるかどうか（DR-0112 が最初に挙げた観点で、実測結果と無関係に成立する）
- hooks 層の起動コスト実測。DR-0112 の Success Criteria は「移行前を下回る」であり、node 単体では満たせない
- settings.json が hook をシェバン経由で直接起動する制約。PATH が truncated なので、mise shim のような PATH 依存の解決は使えない（shebang_test.py と同じ理由）
- CI は node で走り、`npx tsc --noEmit` と `node --test` が型検査とテストの実行環境である（DR-0112 の Confirmation、DR-0113 の Context）

## Considered Options

- hooks 層も node で実行する（DR-0112 の当初想定のまま）
- hooks 層は bun で実行し、CI の型検査とテストは node で行う
- hooks 層の TypeScript 移行を見送り、Python のまま据え置く

## Decision Outcome

Chosen option: "hooks 層は bun で実行し、CI の型検査とテストは node で行う", because 型契約の共有という主目的は runtime の選択と無関係に成立し、起動コストという副次目的は bun を採ってはじめて満たせるため。node は起動コストの点で hooks 層の runtime として失格 (disqualified) であり、この記録がその判断そのものと、bun を採る場合にシェバンがどの形になるかを残す。

### Consequences

- Good, because 型契約の共有は runtime に関わらず得られ、DR-0112 の主目的が保たれる
- Good, because 起動コストは bun 採用時に実際に下がる。python3 の 24.6ms から bun の 14.7ms へ、Bash matcher 8 本で約 79ms 縮む
- Bad, because node は起動コストの点で hooks 層の runtime から外れる。node の空プロセスは 30.4ms で python3 の 24.6ms より遅く、node 単体の採用は DR-0112 の Success Criteria を悪化させる方向に働く
- Bad, because 配布ランタイムの前提が hooks 層だけ bun を追加で要求する。DR-0112 が書いた「Node 24 以上」という床は workflows/skills 層には残るが、hooks 層はそれだけでは足りない
- Bad, because bun のインストール経路が環境ごとに揺れうる。mise shim (`~/.local/share/mise/shims/bun`) は settings.json の truncated PATH では解決できないため、シェバンは絶対パスを直接書く必要がある。Homebrew 経由で入れた場合は `#!/opt/homebrew/bin/bun` が `#!/opt/homebrew/bin/python3` と同じ形の固定パスになるが、bun.sh のインストーラーが既定で使う `~/.bun/bin/bun` はユーザーのホームディレクトリに依存し、同じ固定パスにならない

### Confirmation

`hooks/_lib/tests/shebang_test.py` と同じ形のテストを hooks 層の `.ts` に用意し、実行ビットを持つ追跡 `.ts` の 1 行目が固定のシェバン（bun の絶対パス、Homebrew 経由なら `#!/opt/homebrew/bin/bun`）と一致することを検査する。移行が始まるまでは対象 0 件で green になる。CI 側の型検査とテストは `npx tsc --noEmit -p tsconfig.json` と `node --test` のまま変わらない。

## Pros and Cons of the Options

### hooks 層も node で実行する

DR-0112 の当初想定通り、workflows/skills 層と同じ runtime を hooks 層にも使う。

- Good, because runtime が 1 つで済み、DR-0113 の「node と bun のどちらでも動く」規律を hooks 層で守る必要がない
- Bad, because 起動コストが python3 より悪化し（30.4ms > 24.6ms）、DR-0112 の Success Criteria を満たせない

### hooks 層は bun で実行し、CI は node で行う

hooks 層の実行だけ bun のシェバンに切り替え、型検査とテストは既存の node のまま保つ。

- Good, because 型契約の共有と起動コストの改善を両立できる
- Bad, because DR-0113 の「bun 印の識別子を書かない」規律が、この層で実際に踏まれる条件になる。node で動かない bun 専用 API を書けば CI だけが落ち、hooks 実行では気づけない

### hooks 層の TypeScript 移行を見送る

Python のまま据え置き、workflows/skills 層だけ TypeScript に留める。

- Good, because シェバンの絶対パス問題も runtime 追加の配布前提も発生しない
- Bad, because DR-0112 が挙げた「helper 同士で型を共有する」目的が hooks 層には届かない。`hooks/_lib` は fan-in 16 の塊で、DR-0112 の Migration Strategy が最後のスライスに位置づけている

## More Information

### Migration Strategy

hooks 層のスライスが始まる時点で、各 hook の shebang 行を `#!/opt/homebrew/bin/python3` から bun の絶対パスへ書き換える。`hooks/_lib/tests/shebang_test.py` が担う 4 つの検査（実行ビット付き `.py` のシェバン、stale シェバンの不在、settings.json 由来スクリプトのシェバン、`_lib` 配下のシェバン不在）を `.ts` 向けに複製し、python3 版はそのスライスが完了するまで両方が green であることを確認する。

### Rollback Plan

シェバンの書き換えは各 hook ファイル単位で独立しており、DR-0112 の Rollback Plan（スライス単位の PR revert）がそのまま適用できる。bun のインストールが得られない環境が判明した場合は、この記録だけを revert し hooks 層の移行を node runtime の選択肢へ戻すか、Python のまま据え置く選択肢へ戻す。

### Success Criteria

- hooks 層の移行後、`PreToolUse` の Bash matcher 8 本の合計起動時間が移行前（python3 24.6ms × 8）を下回る。node 単体ではこの基準を満たせないことが実測済みなので、bun のシェバンで起動した状態で計測する
- hooks 層の `.ts` が bun 専用 API を書かずに `node --test` の下でも green である（DR-0113 の discipline を hooks 層で実際に満たす）
- 追跡された hooks 層の `.ts` すべてのシェバンが絶対パスで固定され、PATH 解決に依存しない

### Reassessment Triggers

- node の起動コストが bun と同等になり、hooks 層だけ runtime を分ける理由が消える（DR-0113 の Reassessment Triggers と同じ条件）
- bun の Homebrew 経由インストールが配布対象の環境で保証できなくなり、固定パスのシェバンが書けなくなる
- hooks 層の移行後、実測した起動時間の改善が DR-0112 の Reassessment Triggers が定める 1 本あたり 5ms を下回る

### 関連する記録

- DR-0112 Adopt TypeScript for helper scripts。段階移行そのものと、当初の起動コスト見積もりを決めた記録。この記録はその見積もりが実測と食い違った後の、hooks 層に限った runtime の選び直しであり、supersede ではない
- DR-0113 Ban bun-branded identifiers in TypeScript sources。node と bun の両方で動く discipline を lint で執行する記録で、この記録が hooks 層の runtime として bun を選ぶ理由を裏付ける実測値（python3 24.6ms、node 30.4ms、bun 14.7ms）の出どころでもある
