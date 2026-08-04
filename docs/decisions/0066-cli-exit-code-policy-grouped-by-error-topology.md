---
status: "accepted"
date: 2026-05-13
decision-makers: thkt
scope: [cli, coding]
---

# CLI exit code policy grouped by error topology

## Context and Problem Statement

ADR-0065 で scout の exit code policy (sysexits.h + GNU coreutils + PJ 拡張枠 9 種) を固めた後、同種の方針を他 CLI (xr / notch / yomu 系 / Hook tool 系) に横展開する判断が必要になった。`amici::cli::exit_code` は `sysexits.h` の 6 種 (0/64/70/73/74/75) を共通基盤として提供しており、CLI 群の実装は既に部分的に統一されている。

ただし、各 CLI で「支配的エラー軸」が異なる。外部 API fetch は rate limit / 5xx / timeout が中心、ローカル semantic 検索は model load / sqlite I/O / embedding 生成、Hook tool は fail-closed/open 判定が外形契約として走る。単一 policy で全 CLI を縛ると、ある CLI では使わない exit code が残ったり、別の CLI で必要な細分類が無くなったりする。

ADR-0065 を全 CLI に flat 展開するのではなく、エラー topology で分類してグループ単位で policy を決める。

## Decision Drivers

* 各 CLI の支配的エラー軸に合った subset を採用し、未使用 code を残さない
* `amici::cli::exit_code::codes` (sysexits.h 6 種定数) を共通基盤として活用
* Hook 経由で exit code が挙動を決定する場合 (fail-closed/open) との整合
* 将来のメンバー追加・グループ間移動が低コストで済む粒度

## Considered Options

* Option A. 単一 policy (ADR-0065 を全 CLI に適用)
* Option B. エラー topology で 3 グループに分け、グループごとに subset と優先順位を決定
* Option C. 個別自由 (ADR-0065 は scout 固有、他 CLI は各自判断)

## Decision Outcome

Chosen option: Option B。Option A は未使用 code が増えて読み手のノイズになる (例: Hook tool に 124 TIMEOUT は不要、外部 API 系に 70 INTERNAL は使用頻度が低い)。Option C は CLI 間で同じ概念に違う code を割り当てるリスクが高く、agent / script の retry policy が CLI ごとに変わってしまう。

### Consequences

* Good, グループ単位で支配的エラー軸に合わせた subset を採用でき、未使用 code が減る
* Good, グループ間の境界が明文化され、新規 CLI 追加時の判定が機械的にできる
* Good, `amici::cli::exit_code` を共通基盤としつつ、グループ固有の拡張 (UNKNOWN, TIMEOUT) は各グループ ADR で追加可能
* Bad, グループの数だけ ADR (または ADR セクション) が必要になり、ドキュメント面積が増える
* Bad, グループ間移動が起きると ADR 改訂が複数走る

### Confirmation

各 CLI に sync issue を発行し、issue の checklist で「採用するグループ」「採用しない code とその理由」を明示する。実装 PR で exit code が本 ADR の table と一致するかレビューで確認。

## Pros and Cons of the Options

### Option A. 単一 policy 全 CLI 適用

* Good, ADR 1 枚で済む
* Good, 全 CLI で同じ code に同じ意味
* Bad, 未使用 code がノイズ (Hook tool に 124, 外部 API に 70)
* Bad, グループ固有の必要 code (Hook の fail-closed) が表現できない

### Option B. エラー topology で 3 グループ分け (採用)

* Good, 各グループの支配的エラー軸に合った subset
* Good, グループ間境界が明文化されるので新規 CLI 判定が機械的
* Bad, ADR 面積増
* Bad, グループ間移動時に複数 ADR 改訂

### Option C. 個別自由

* Good, 各 CLI の作者裁量
* Bad, 同じ概念 (rate limit) に違う code が割り当てられるリスク
* Bad, agent / script の retry policy が CLI ごとに変わる

## More Information

### Group Topology

| Group | 性質 | 支配的エラー軸 | メンバー |
| --- | --- | --- | --- |
| 1 | 外部 API fetch | rate limit / 5xx / timeout / network IO | scout, xr, notch |
| 2 | ローカル semantic 検索 | model load / sqlite I/O / embedding 生成 | rurico, amici, sae, yomu, recall |
| 3 | Hook tool (fail-closed/open) | 0/1/2 三値の外形契約 + 内部分類 | guardrails, shields, gates, formatter, reviews, litmus, assay, chronicler |

### Group 1: 外部 API fetch

retryable 軸が中心。ADR-0065 の 9 種をそのまま採用。`TIMEOUT` (124) と `TEMP_FAILURE` (75) の分離が effective。

| Exit | Const | JSON `error.code` | 主な発生条件 |
| --- | --- | --- | --- |
| 0 | EX_OK | (none) | Ok |
| 64 | EX_USAGE | `USAGE_ERROR` | clap parse, env var missing |
| 65 | EX_DATAERR | `DATA_ERROR` | URL / ID 形式不正 |
| 66 | EX_NOINPUT | `NOT_FOUND` | 404 |
| 74 | EX_IOERR | `IO_ERROR` | retry 不可な network IO |
| 75 | EX_TEMPFAIL | `TEMP_FAILURE` | rate limit, 5xx |
| 124 | GNU `timeout` | `TIMEOUT` | API timeout |
| 104 | PJ 拡張 | `UNKNOWN` | 分類不能 (退避) |

70 INTERNAL は使用頻度低いが許容 (assert violation 等)。

### Group 2: ローカル semantic 検索

`amici::cli::exit_code::codes` を基盤として、INTERNAL/UNKNOWN 分離を追加。Timeout は通常発生しない (ローカル処理) ので 124 は採用しない。

| Exit | Const | JSON `error.code` | 主な発生条件 |
| --- | --- | --- | --- |
| 0 | EX_OK | (none) | Ok |
| 64 | EX_USAGE | `USAGE_ERROR` | clap parse, env var missing |
| 65 | EX_DATAERR | `DATA_ERROR` | クエリ形式不正, encoding 不正 |
| 70 | EX_SOFTWARE | `INTERNAL` | invariant violation, model artifact 不整合 |
| 73 | EX_CANTCREAT | `CANT_CREAT` | DB / index file 作成失敗 |
| 74 | EX_IOERR | `IO_ERROR` | sqlite IO, model load IO |
| 75 | EX_TEMPFAIL | `TEMP_FAILURE` | model download retry 可能な失敗 |
| 104 | PJ 拡張 | `UNKNOWN` | 分類不能 (退避) |

`amici::cli::exit_code` に `INTERNAL` と `UNKNOWN` を追加することで、グループ 2 全体が共通基盤を共有できる。

### Group 3: Hook tool (fail-closed/open)

Hook は exit code で挙動を分岐する (0 = allow, 非0 = block)。1 と 2 を意図的に分けて、advisory と blocking を区別する。

| Exit | 出典 | 意味 | Hook 挙動 |
| --- | --- | --- | --- |
| 0 | EX_OK | 正常終了 | allow |
| 1 | 慣例 | 一般的失敗 (advisory) | warn (Stop 系で使用) |
| 2 | 慣例 | blocking 失敗 | block (PreToolUse 系で使用) |
| 64 | EX_USAGE | Hook 入力 JSON 不正 | block (Hook 入力契約違反) |
| 70 | EX_SOFTWARE | Hook 自身の内部不具合 | block (fail-closed) |

Hook tool は外形契約 (0/1/2) が支配的なので、内部詳細は JSON stderr で出す。sysexits.h の細分類はオプション。

### Cross-Group Rules

全グループ共通で守る規約。

| 規約 | 内容 |
| --- | --- |
| 3 層出典 | sysexits.h (0, 64-78) + GNU coreutils (124) + PJ 拡張 (80-104) を明示 |
| 数値↔文字列分離 | 終了コードは数値、JSON `error.code` は文字列。混同しない |
| `amici::cli::exit_code` 活用 | 共通定数 (USAGE/SOFTWARE/CANT_CREAT/IO_ERR/TEMP_FAIL) は `amici` から import |
| `UNKNOWN` の扱い | 増えたら設計見直し signal。`anyhow::Error` 握り潰し検知の意図 |

### Group Assignment Rationale

assay と xr は README なしで判定したため、根拠を残す。

| ツール | 根拠 | 出典 |
| --- | --- | --- |
| xr | `description = "Read-only Twitter/X CLI for LLM agents"`、auth/Transport/Api エラー区分 | `Cargo.toml`, `src/lib.rs` |
| assay | `HookInput` stdin pattern, spec.md / eval-criteria.md を見る | `src/lib.rs:20` `pub fn run(stdin: &str) -> i32` |

### Deferred Decisions

ADR-0065 改訂時に着想元 (kodak_diary 記事) で言及されていた 2 点は実需出てから判断する。

| 項目 | 記事の方針 | 本 ADR の現状判断 | 再検討トリガ |
| --- | --- | --- | --- |
| 67 EX_NOUSER の UNAUTHENTICATED 近似割り当て | 認証主体確認不能の近似コードとして 67 を採用、備考で明記 | 採用しない。401/403 は 64 USAGE_ERROR に集約 (env var 不在と同居)。理由: 近似割り当ては記事自身が「レビューで突っ込まれやすい」と注意喚起。Group 1 (外部 API) 全体で contract を揃えるため曖昧コードを増やさない | 401 と 403 を agent 側で区別したい実需が出た場合、または OAuth flow との連携で UNAUTHENTICATED を独立分類する必要が出た場合 |
| 73 EX_CANTCREAT を DISK_FULL 代表として扱う割り切り | 重複させないため EX_CANTCREAT を容量不足代表に流用 | 採用しない。amici の doc コメント (`Cannot create a (user-visible) output file or path`) の sysexits.h 厳密定義のまま使う。Group 2 (ローカル semantic 検索) では DB / index file 作成失敗のみに割り当てる | sqlite DB 作成中の disk full / permission denied / parent dir 不在を agent 側で区別したい実需が出た場合、80-104 拡張枠で新コードを採番 |

### Reassessment Triggers

* グループ間移動が発生した場合、本 ADR の table を改訂
* `amici::cli::exit_code` に `INTERNAL` / `UNKNOWN` 追加が決まった場合、本 ADR の Group 2 セクションを改訂
* Deferred Decisions 表のいずれかの再検討トリガが発火した場合、本 ADR を改訂
* 4 つ目のグループ topology が登場した場合 (例: long-running daemon / IPC server)、本 ADR を superseded

### References

* ADR-0060: Adopt Agent-Friendly CLI Design Principles
* ADR-0065: scout JSON output schema and sysexits exit code policy
* Inspiration: kodak_diary "終了コードを PJ 独自ルールにしすぎないための設計メモ" (<https://zenn.dev/kodak_diary/articles/5a84d597c69b0b>)
* Existing exemplar: `amici::cli::exit_code` (sysexits.h u8 定数 + `CliError` trait)
* Standards: sysexits.h, GNU coreutils `timeout`
