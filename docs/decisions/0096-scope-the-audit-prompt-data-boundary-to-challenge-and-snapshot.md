---
status: "accepted"
date: "2026-08-03"
decision-makers: thkt
---

# DR-0096: audit の prompt data 境界を Challenge/Verify/Integrate/Snapshot の 4 段に絞る

## Context and Problem Statement

`/audit` は外部 diff をレビューするので、diff の作者が書いたテキストが reviewer 経由で workflow の各段に届く。reviewer 起動 prompt (`workflows/audit.js:520`) は各 reviewer に `git diff` を叩かせ、疑わしい行を `summary` に自由記述として引用させる。その `summary` は次段の agent への指示文にそのまま連結されていた。境界は「The findings are as follows.」という散文の慣習だけで、marker は無かった。

`workflows/build.js:206-208` の `fencedBody` は同じ形の境界を issue body に対して実装済みだが、marker が固定文字列で、`JSON.stringify` はハイフンをエスケープしないため、payload 側に `----- END UNTRUSTED ISSUE BODY -----` と同じ文字列を仕込むと marker が原文のまま通過し、fence を早期に閉じられる (Issue #304 で `node -e` により実証済み)。この欠陥を audit 側にも複製しないことが要件になった。

影響が実在する段は 2 つ。Challenge (`workflows/audit.js:632` 付近) は verdict が finding の生死を決めるので、`disputed` を誘導されると本物の finding が survivors からも needs_context からも消え、tally からも読めなくなる。Snapshot (旧 `workflows/audit.js:133` 付近) は当時 `agentType: general-purpose` で起動しており、無制限の Bash を持っていた。Verify と Integrate は連結してはいるが、Verify の出力は Integrate に転送されず (DR-0095)、Integrate は membership を script が既に決めているため finding を刈れず、実害は薄い。

## Decision Drivers

- 固定 marker の欠陥 (`JSON.stringify` がハイフンをエスケープしないため payload からの早期クローズが起きる) を audit 側に複製しない
- `docs/SECURITY_MODEL.md` は hook 等の pattern matching を "probabilistic defense" と位置づけている。prompt 中の宣言文も同じ位置づけで、この変更を境界の強制と読ませてはならない
- Issue #304 の Scope は `workflows/audit.js` と関連 agent 定義に限定されており、`workflows/build.js` の同じ欠陥や他 6 workflow (polish/assert/adrift/shake/code) への横展開は単独では判断しきれない
- Snapshot 段は `python3 snapshot.py` の実行と一時ファイル書き込みしか行わないので、tool 制限という決定論的な境界を fence と併用できる

## Considered Options

- Option A: `workflows/build.js` の `fencedBody` の形を写しつつ、marker に run ごとの nonce (`crypto.randomUUID()`) を埋めた `fenced(value)` helper を `workflows/audit.js` にローカル定義し、Challenge/Verify/Integrate/Snapshot の 4 箇所全てに適用する。Snapshot 段は agentType も `general-purpose` から tool 制限した専用 agent (`generator-snapshot`) に差し替える。`workflows/build.js` の改修、`workflows/_lib/` への切り出し、他 6 workflow への展開は対象外とし、本 DR に理由を記録する
- Option B: 影響が実在する Challenge と Snapshot の 2 段のみに fence を適用し、実害の薄い Verify と Integrate は素の `JSON.stringify` のまま残す
- Option C: `fenced()` を `workflows/_lib/` の共有 helper として切り出し、audit.js と polish.js など複数 workflow から参照する形にする

## Decision Outcome

Option A を採用する。Verify と Integrate は実害が薄いが、fence 適用の限界コストは 1 行の wrap だけで、4 箇所を同じ helper で覆うほうが「どの段が fence 済みか」を読み手が都度確認する必要がなくなる (Option B は不採用)。共有 helper の切り出しは、対象が audit.js 内の 4 呼び出しに留まる現状では `workflows/_lib/` と `.ja/workflows/_lib/` の新設に見合わない。切り出しの判断基準は Reassessment Triggers に譲る (Option C は現時点で不採用)。

### Consequences

- Good, because Challenge の verdict と Snapshot の shell 実行が、diff の作者が仕込んだ文字列を指示として読まなくなる。marker は run ごとに変わる nonce を含むため、payload 内のどの文字列も marker を再現できない
- Good, because Snapshot 段が専用 agent (`generator-snapshot`) に変わり、tool 宣言が `python3` 実行と一時ファイル書き込みに絞られた。fence を破られても実行できる操作がその範囲に決定論的に制限される
- Bad, because fence が防がない範囲が残る。reviewer 起動 prompt (`workflows/audit.js:520`) は各 reviewer に `git diff` を直接叩かせるので、fence を適用したどの段よりも先に、攻撃者が書いたテキストは無制限の tool を持つ reviewer agent に届いている。fence は reviewer から後段への転送だけを覆い、reviewer 自身が読む入口は覆わない
- Bad, because 宣言文はあくまで prose で、`docs/SECURITY_MODEL.md` が言う "probabilistic defense" の一種に留まる。agent が宣言文を無視する確率をこの変更は 0 にしない。marker が閉じられないことを T-001 が固定するのみで、agent の挙動が実際に変わるかは本 Issue の Premises が明示する通り未実証 (tentative) である
- Bad, because `workflows/build.js:206-208` の `fencedBody` は固定 marker のまま残る。issue body から `----- END UNTRUSTED ISSUE BODY -----` を仕込んで早期クローズする経路は、本 DR の変更後も build.js 側に残存する
- Bad, because polish/assert/adrift/shake/code の 5 workflow は同種の LLM 出力連結 (`JSON.stringify(findings)` 等をそのまま次段の prompt に埋め込む形) を持つが、いずれも fence を適用していない。audit.js だけが境界を持つという非対称が生まれる

### Confirmation

`workflows/audit.js` の Challenge/Verify/Integrate/Snapshot の 4 呼び出しが `fenced(...)` を経由していることをコードレビューで確認する。`node --test workflows/audit/tests/*.test.js` で、END marker と同じ文字列を `summary` に仕込んだ finding を渡しても抽出領域が JSON として parse できること (T-001)、同一 run 内で marker が一貫すること (T-003)、別 run では marker が変わること (T-004) を確認する。Snapshot 段の agent 起動が `agentType: general-purpose` を渡さず `generator-snapshot` を渡すこと (T-005, T-006) を確認する。

## More Information

- 上流の Issue は #304。本 DR は #304 の Plan の U-004 にあたり、fence 実装自体は U-001 (nonce 付き fence helper と 4 段への適用)、専用 agent 定義は U-002、Snapshot 段の agentType 差し替えは U-003、実 `snapshot.py` まで通した偽装 marker の検証は U-005 が担う
- `workflows/build.js` の `fencedBody` は 1 個目の実装で、本 DR の `fenced()` が 2 個目の instance にあたる。marker を固定文字列から run ごとの nonce に変えた点が build.js からの逸脱で、`JSON.stringify` がハイフンをエスケープしないという同一の欠陥を複製しないための変更である
- `.ja/workflows/audit.js` が canonical (ADR-0073)。英語側は同一コミットでミラーし、宣言文の翻訳のみを行い、marker の構造と nonce の生成コードは両側で同一にする

### Reassessment Triggers

- `workflows/build.js` の `fencedBody` が実際に early-close で悪用された、または悪用可能性が改めて指摘されたとき、同じ nonce 化を build.js 側にも適用する判断が優勢になる
- polish/assert/adrift/shake/code のいずれかで、reviewer や critic の自由記述 (summary 等) が次段の判定 (verdict/membership/merge) を左右する新しい段が 1 つ現れたとき (audit の Challenge に相当するものが 2 つ目として登場したとき)、`workflows/_lib/` への `fenced()` 切り出しと当該 workflow への適用を検討する
- reviewer 起動 prompt が `git diff` を叩く経路 (fence より手前で untrusted なテキストに触れる箇所) で実害のある injection が観測されたとき、reviewer 自身の tool 権限を絞る、または reviewer の出力を追加でサニタイズする対応を別途検討する
