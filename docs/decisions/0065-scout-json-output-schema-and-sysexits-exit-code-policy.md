---
status: "accepted"
date: 2026-05-07
decision-makers: thkt
---

# scout JSON output schema and sysexits exit code policy

## Context and Problem Statement

ADR-0060 で agent-friendly CLI の 3 軸 + 補強パターンを採択した後、scout v0.7.1 の監査で必須 5 項目のうち 4 項目が Missing と判明した (`/Users/thkt/GitHub/cli/scout/.claude/workspace/research/2026-05-07-adr-0060-scout-cli-gap.md`)。Phase 2 (`--json` + 構造化エラー JSON) と Phase 3 (sysexits.h 拡張) の方針を、scout 個別の決定として確定する。template は select-adr-template.sh の出力 (`process-change`) を override し `architecture-pattern` を採用した。本決定は API 設計 (出力スキーマと exit code 体系) であって workflow ではないため。

## Decision Drivers

* agent/script との API 契約を一貫させる (JSON `error.code` ↔ exit code が同じエラー分類軸の表裏)
* 既存 Markdown 出力経路との互換性を保ちつつ JSON 経路を追加 (Phase 2 を非破壊化)
* exit code 拡張 (Phase 3) は破壊的変更 → 適切な major bump タイミングで実施
* 既存 Rust CLI 群 (yomu/recall/sae) の実装を再利用

## Considered Options

* Option A. Phase 2 (JSON schema) と Phase 3 (sysexits) を 1 ADR で統合
* Option B. Phase 2 と Phase 3 を別 ADR に分離
* Option C. ADR を書かず各 PR で都度判断

## Decision Outcome

Chosen option: Option A。JSON `error.code` と exit code は同じエラー分類軸の表裏であり、別 ADR にすると整合性強制が後追いコストとして発生する。1 ADR で対応表を 1 つの table として固定すれば、Phase 2 実装時に exit code 表もすでに固定され、Phase 3 で再決定が不要になる。

### Consequences

* Good, JSON `error.code` ↔ exit code の対応が単一の table で固定され、Phase 2/3 で再決定が不要
* Good, scout 固有の API 契約が user-global ADR 連番に乗り、ADR-0060 (原則) と参照しやすい場所に配置される
* Bad, ADR 1 件のサイズが大きくなる (Phase 2/3 両方の決定を内包)

### Confirmation

Phase 2 PR で JSON schema を `serde` 派生型として実装し、本 ADR の table と一致するか PR レビューで確認する。Phase 3 PR で exit code を sysexits.h 値に置換する際、既存テスト (`tests/cli_integration.rs`) を本 ADR の table に合わせて更新する。

## Pros and Cons of the Options

### Option A. 1 ADR 統合

* Good, `error.code` ↔ exit code の対応が単一 table で固定
* Good, Phase 3 着手時に追加 ADR 起草が不要
* Bad, ADR が ~120 行に膨らむ (line budget ~80 を超過)

### Option B. 別 ADR 分離

* Good, ADR ごとの粒度が小さい
* Bad, Phase 3 着手時に本 ADR を改訂するか追加 ADR が必要
* Bad, JSON `error.code` を決めた後で exit code 体系を後追い決定すると、対応関係が曖昧になりやすい

### Option C. ADR なし

* Good, ドキュメント工数ゼロ
* Bad, 将来の改修時に「なぜこの schema/exit code か」が再考対象になる
* Bad, Adoption Gate の 3 条件 (hard to reverse/surprising/real trade-off) すべて該当 → ADR が必要

## More Information

### JSON Schema

成功時 (output に command-specific data + degradation signal):

```json
{
  "data": { /* command-specific payload */ },
  "degraded": false,
  "notes": []
}
```

エラー時:

```json
{
  "error": {
    "code": "USER_ERROR",
    "message": "...",
    "next_step": "...",
    "candidates": ["..."],
    "retryable": false
  }
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `data` | object | Yes (success) | command-specific schema は各コマンド側で別 ADR or comment で確定 |
| `degraded` | bool | Yes (success) | 機能低下フラグ。raw fallback 等で `true` |
| `notes` | string[] | Yes (success) | 機能低下の理由・補足。`degraded` が true の時に non-empty |
| `error.code` | string (enum) | Yes (error) | exit code 表と 1:1 対応 (下表) |
| `error.message` | string | Yes (error) | 人間向けメッセージ |
| `error.next_step` | string | Optional | 次の手 (例: "Set BRAVE_SEARCH_API_KEY") |
| `error.candidates` | string[] | Optional | 修正候補 (例: typo の OSA distance マッチ) |
| `error.retryable` | bool | Yes (error) | リトライで成功する可能性があるか |

### Exit Code Policy (9 種、3 層出典)

出典は 3 層構成。混在を意識的にやるための明示。

| 範囲 | 出典 | 備考 |
| --- | --- | --- |
| 0, 64-78 | sysexits.h (BSD) | OpenBSD man 3 sysexits |
| 124 | GNU coreutils `timeout` 慣例 | `--preserve-status` 非指定時 |
| 80-104 | PJ 拡張枠 (kodak_diary 記事方針を採用) | 細分類が必要なときのみ採番 |

| Exit | Const / 出典 | JSON `error.code` | scout での発生条件 |
| --- | --- | --- | --- |
| 0 | EX_OK | (none) | Ok 経路 |
| 64 | EX_USAGE | `USAGE_ERROR` | clap parse error, `conflicts_with` 違反, env var missing (BRAVE_SEARCH_API_KEY) |
| 65 | EX_DATAERR | `DATA_ERROR` | URL invalid, owner/repo malformed, encoding 不正 |
| 66 | EX_NOINPUT | `NOT_FOUND` | repo / file not found, 404 |
| 70 | EX_SOFTWARE | `INTERNAL` | invariant violation, deserialize unexpected schema (起因が scout 自身) |
| 74 | EX_IOERR | `IO_ERROR` | network IO error (retry 不可), write failure (BrokenPipe 除く) |
| 75 | EX_TEMPFAIL | `TEMP_FAILURE` | rate limit, 5xx, retry で回復見込みあり (timeout 以外) |
| 104 | PJ 拡張 | `UNKNOWN` | 上記いずれにも分類できない (退避先、増えたら設計見直し signal) |
| 124 | GNU `timeout` 慣例 | `TIMEOUT` | fetch / research の全体 timeout, API timeout (retry policy が `TEMP_FAILURE` と異なる) |

`error.retryable` は `code == "TEMP_FAILURE"` か `code == "TIMEOUT"` の時のみ `true`、他は `false`。`TIMEOUT` と `TEMP_FAILURE` を分けるのは、retry sleep duration が違うため (timeout は backoff を長めに、rate limit は短め)。

### Classification Priority

複数分類が当てはまる場合の優先順位。scout の実エラーソース (clap parse/URL invalid/404/rate limit/timeout/JSON parse/network IO) から 5 段に絞る。

| 優先 | ルール | 分類 |
| --- | --- | --- |
| 1 | env var missing / 設定起因 / 引数誤り | 64 USAGE_ERROR |
| 2 | URL / owner / repo / encoding の形式不正 | 65 DATA_ERROR |
| 3 | リソース不在 (404, search 0 件) | 66 NOT_FOUND |
| 4 | retry で回復見込みあり (rate limit, 5xx, timeout) | 75 TEMP_FAILURE または 124 TIMEOUT |
| 5 | アプリ内部不具合と判断できる | 70 INTERNAL |
| 退避 | 上記いずれにも分類できない | 104 UNKNOWN |

ルールの読み方: 上から順に評価。マッチした時点で確定。例: GitHub API から 404 と rate limit 余地のあるレスポンスが同時にあった場合、優先 3 で 66 NOT_FOUND を採用 (rate limit より先に 404 評価)。

`UNKNOWN` が増える場合は分類設計の signal。`anyhow::Error` の握り潰しを検知する目的で意図的に独立。

### Migration Strategy

| Phase | 対象 | 互換性 | リリース |
| --- | --- | --- | --- |
| 2 | `--json` global flag + JSON schema 出力 | 非破壊 (Markdown 経路維持) | 0.8.x で minor bump |
| 3 | exit code を 0/1/2 → 0/64/65/66/74/75 に拡張 | 破壊的 (既存 script 影響) | 1.0.0 で major bump |

Phase 2 で JSON `error.code` を導入した時点で、内部の `ScoutError::user_error`/`internal`/`transient` から sysexits 6 種への分類関数を確定させる。Phase 3 では分類関数の出力を `ExitCode` に流すだけで完結する。

### Trade-offs

| 失う | 得る |
| --- | --- |
| ADR 1 件のサイズが ~120 行に膨らむ | Phase 2/3 で `error.code` ↔ exit code 対応が再決定不要 |
| sysexits 6 種の固定 (16 種フル準拠より粒度低い) | scout の現エラー分類 (3 種) からの拡張幅が現実的 |

### Reassessment Triggers

* sysexits 9 種で不足が出た場合、16 種フル準拠への拡張を本 ADR を superseded して新 ADR で記録
* `data` 内 schema が共通化される兆候が出た場合、commands 横断 schema として別 ADR で抽出
* `UNKNOWN` (104) の発生比率が増えた場合、分類設計を見直す
* 他 CLI (xr/notch/yomu 系/Hook tool 系) で本 policy を採用する流れになった場合、CLI 横断方針を別 ADR で抽出 (本 ADR は scout 固有のまま)

### References

* ADR-0060: Adopt Agent-Friendly CLI Design Principles
* Audit: `/Users/thkt/GitHub/cli/scout/.claude/workspace/research/2026-05-07-adr-0060-scout-cli-gap.md`
* Issue: thkt/scout#67
* Phase 1 PR: thkt/scout#74
* Revision (2026-05-13) follow-up issues: thkt/scout#83 (TIMEOUT 124), thkt/scout#84 (INTERNAL 70/UNKNOWN 104), thkt/scout#85 (classification priority)
* Revision (2026-08-02): 決定当時の記述が現行 scout と食い違っていた 3 点を更新。(1) search backend が Brave に移行し (scout DR-0005/v2.0.0)、必須 env var 名が `GEMINI_API_KEY` から `BRAVE_SEARCH_API_KEY` に変わったため、上表の例示を現行名に置換。(2) search 0 件は `NOT_FOUND` (66) ではなく空出力で exit 0 を返すため (scout DR-0020: 1 行 1 URL 出力)、66 の発生条件から削除。(3) SIGINT/SIGTERM 由来の 130/143 が scout DR-0017 で追加されており、上表の 9 種には含まれない。exit code の割り当て自体は変えていない
* Standards: sysexits.h, GNU coreutils `timeout`, MCP Tools spec
* Inspiration: kodak_diary "終了コードを PJ 独自ルールにしすぎないための設計メモ" (<https://zenn.dev/kodak_diary/articles/5a84d597c69b0b>) - 数値↔文字列分離、分類優先順位、80-104 拡張枠の方針を参考
* Existing exemplars: yomu (`--json` global), sae (`output.rs:6-8` two-stream output), recall (`USER_ERROR_MARKERS`), amici (`cli::exit_code::codes` で sysexits u8 定数 + `CliError` trait 提供済み)
