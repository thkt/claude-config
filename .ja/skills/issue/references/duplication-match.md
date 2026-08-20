# 重複の照合

Phase 2 で plan 下書きがある場合にだけ使う。会話に `/think` の plan 下書きがあれば、それを照合対象に選ぶ。なければ ${CLAUDE_SKILL_DIR}/scripts/pick-plan.py に issue のタイトルを渡す。`path` が返された場合は、その下書きを選ぶ。`ambiguous` が真の場合は、AskUserQuestion で `candidates` を提示し、ユーザーに選択を求める。

本文と `## Plan` の間で同じ知識が重なるすべての箇所を照合対象とする。片方を直すともう片方も直す必要がある場合は、同じ知識と判定する。独立に変わりうる内容は両方に残す。

本文側の重複箇所を `## Plan` への参照に置き換える。参照は本文から `## Plan` へ向ける。置き換えた後も、次の 3 つは本文に残す。

- その見出しが何を変更するかを述べる 1 行
- 却下理由と、その根拠となる `file:line`
- 課題の記述

本文と plan が食い違う場合は、plan を正として本文を直す。この扱いは、`/think` が plan を独立したファイルへ書き出した後で、本文の節が作られる順序を反映する。Acceptance Criteria も Outcome と重なる。ただし、build には渡らず、人間がマージを判断する際に使うため、本文に残す。

| 本文の節          | Plan 側の対応    |
| ----------------- | ---------------- |
| Approach          | unit の contract |
| Testing Decisions | T-NNN            |
| Scope の In scope | files            |
