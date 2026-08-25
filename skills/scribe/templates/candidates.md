# Candidate store template

In Phase 1, when `docs/wiki/_candidates.md` does not exist,/scribe writes out the content below verbatim. Nothing is substituted. Keep all three sections even while empty. `triage.py` reads 昇格待ち and 単発, Phase 3 step 7 writes into both, and Phase 4 step 5 moves into 棄却, so a missing section leaves a line with nowhere to sit.

## Template

```markdown
# candidates

ページ化前の候補置き場。1 行は「内容 1 行 + 根拠」で、根拠は PR/issue 由来なら #番号、`.claude/workspace/research/` 由来なら (research) と書く。research のファイルパスは書かない。

「単発」は根拠が 1 件の項目で、2 件目が現れたらページへ昇格して行を消す。「昇格待ち」は根拠が 2 件以上ありながら、1 回あたりのページ上限を超えて持ち越した項目。次の run では根拠の多い順にここから先へ進む。「棄却」は Phase 4 が現行コードと突き合わせて落とした項目で、行の次に落とした理由が付く。順位付けの対象から外れる。

## 昇格待ち

## 単発

## 棄却
```
