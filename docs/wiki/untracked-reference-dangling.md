---
globs: ["**/docs/**/*.md"]
---

# git 管理外パスへの参照

## 内容

git 管理外のファイル (gitignore 配下、ローカル生成物) のパスを、commit される成果物から参照しない。参照側だけが main に載り、他の環境には参照先が無い状態になる。参照の実在を機械的に確認する仕組みがあると、その参照は壊れていると判定される。

## 定型手順

1. commit する文書にパスを書く前に、`git ls-files <path>` でそのパスが管理下かを確認する
2. 管理外なら、パスの代わりに由来の種別だけを書く
3. 参照を残したいなら、参照先を tracked にするか、参照側を gitignore 配下へ移す

## 参照コード

- `skills/scribe/SKILL.md` の Reference traceability 不変条件 (`.claude/workspace/research/` のパスを `docs/wiki/` 配下に書かない)
- `skills/scribe/SKILL.md` Phase 4 の参照掃除 (ファイルの実在とシンボル名の grep 一致を機械的に確認し、壊れていれば共通項を不成立にする)

## 根拠

- #188 #190 untracked ファイルへの参照が main に載り dangling になった
- #232 `.claude/workspace/research/` を scribe の入力に追加する際、evidence として research のファイルパスを wiki page に書く案を、Phase 4 の参照掃除が壊れた参照と判定するためこの理由で落とした
