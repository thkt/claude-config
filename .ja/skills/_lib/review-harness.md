# レビュー精度ハーネス

`use-context-reviewer-*` の各ハーネス (`<skill>/test/`) が共有するプロトコル。精度は reviewer 自身の confidence でなく、Recall と FP Rate という外部基準で測る。

## blind protocol

dispatch prompt にラベル、期待値、ヒントを含めると Recall が汚染される (2026-06-04 に security のハーネスで判明し、それ以前のベースラインを無効化した)。

1. cases を一時ディレクトリへ中立名でコピーする (case-01.ts のように連番、flag と clean を交互に)。`./db` のようなフレームワーク規約名は文脈なので保持する
2. reviewer agent を Agent tool で起動する。prompt には対象パスと出力フォーマットだけを書く。flag、clean、vuln、safe、テスト、期待の語と、各ファイルが何を含むかの説明は禁止
3. 照合基準を dispatch 前に固定する。後出しで基準を動かさない
4. 各ケースの判定を下表の verdict から選び、`{file, verdict}` の配列として `<skill>/test/results/YYYY-MM-DD-*.json` に記録する
5. `python3 skills/_lib/review_score.py <skill>/test/expected.json <results> [previous-results]` を実行する。指標を自分で数えない
6. `node skills/_lib/harness_hash.ts <skill>` を実行し、印字された 3 つのキーを記録ファイルの直下キーとして書く

連番命名とペア構造から、agent が「テスト集合」と推測しうる状態は残っている。完全な blind には現実的な scaffolding への埋め込みが要るが、ラベル漏洩の除去を優先する。

## 記録の鮮度

記録は、その実行が何を測ったかをハッシュで名乗る。`skills/_lib/tests/harness-freshness.test.ts` が最新の記録のハッシュを現在の内容と突き合わせ、記録の無い skill を未計測として落とす。日付でなくハッシュにするのは、CI の checkout が浅く `git log` の日付を引けないためである。ゲートが読むのは名前順で最後の記録なので、同じ日に 2 回走らせるなら、後の実行が後ろに並ぶ名前を付ける。

| キー                | 対象                                       |
| ------------------- | ------------------------------------------ |
| `definition_sha256` | `agents/reviewers/reviewer-<name>.md`      |
| `skill_sha256`      | `<skill>/SKILL.md`                         |
| `corpus_sha256`     | `<skill>/test/cases/**` と `expected.json` |

## verdict の集合

この 7 つに限る。過去のログは実行ごとに独自の語 (`true`、`full_hit`、`detected_below_severity_min`) を使っており、実行どうしを比べられなくなっていた。`below_min_findings` は `recall_strict` (`hit`/`flagged`) の分母にのみ入り、分子には入らない。`below_severity` と同じ扱いである。

| verdict              | 意味                                                  |
| -------------------- | ----------------------------------------------------- |
| `hit`                | 期待した finding を severity_min 以上で報告した       |
| `below_severity`     | 期待した finding を報告したが severity_min 未満       |
| `other_finding`      | ファイルに finding は出たが期待したものではない       |
| `miss`               | ファイルに finding が出なかった                       |
| `pass`               | clean ケースで finding が出なかった                   |
| `false_positive`     | clean ケースで finding が出た                         |
| `below_min_findings` | min_findings に届かない件数だが、報告された指摘は severity_min 以上 |

## expected.json スキーマ

```json
[
  {
    "file": "cases/flag/<name>.ts",
    "expected": "detected",
    "category": "<skill 固有の id>",
    "severity_min": "medium",
    "note": "<何を捕らえるべきか>"
  },
  { "file": "cases/clean/<name>.ts", "expected": "no_finding", "note": "<なぜ clean か>" }
]
```

`detected` の行は category を書く。per-category recall が、どの検出行が弱いかを指せなくなるため。`min_findings` は省略時 1 で、1 ファイルに独立した finding が複数あるときだけ書く。
