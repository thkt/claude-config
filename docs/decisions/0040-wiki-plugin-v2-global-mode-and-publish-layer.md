---
status: "accepted"
date: 2026-04-14
decision-makers: thkt
---

# wiki plugin v2: グローバルモード・publish 層・wiki_root リゾルバーの導入

## Context and Problem Statement

2026-04-07のADR-0036でwiki plugin（Stop hook + ingest/query/lintスキル）の方針を決定した。
scaffoldは完了（`plugins/wiki/`）したが全コンポーネントが未実装の段階で、v1設計に以下の課題が判明した。

1. **wiki 格納場所が `{cwd}/.wiki/` 固定** - プロジェクトローカルのみ。Zenn記事など
   プロジェクト横断的な知識（ADR-0036 line 90: "プロジェクト横断的な実装パターン"）の
   格納先がない。
2. **recall を永続的 ingest ソースとして扱う設計がない** - Stop hook導入後は二重取り込みに
   なるため、過去セッションの一括取り込みには別の手段が必要。
3. **publish 層がない** - 蓄積した知識をチームへ共有する経路がない。
4. **stale-published の追跡がない** - publish後にwikiを更新しても外部記事が静かに
   staleになる。

## Decision Drivers

- Why Outcome: "wiki:query実行時に3件中2件以上で引用可能な既存ページが返る" かつ
  "sae経由でチームに共有できる"
- DA challengeのV2（HIGH）: 既存SOWの `{cwd}/.wiki/` 固定は4 FRの書き直しを要する
  → "SOW revision" ではなく "SOW v2" として扱う
- DA challengeのV3（MED）: recallを永続ingestソースにするとStop hookと二重取り込み
  → 一射bootstrapスクリプトで代替
- DA challengeのV4（MED）: publish後のstale管理がないとチームに誤情報が流れる
  → `published_to` フロントマター + lintルールで対応

## Considered Options

### A: v1 SOW をそのまま実装し、後から global mode を追加（Phased）

- Good: スコープが小さく確実に動く
- Bad: Stop hook・3スキルすべてが `{cwd}/.wiki/` 依存で書かれるため、後からglobal modeを
  追加する際に9ファイルの書き直しが発生する

### B: 実装前に wiki_root リゾルバーを設計に組み込む（採用）

- Good: 未実装なので今ならコスト増なし。project-local / globalの違いはパス解決だけ
- Good: recall bootstrapを永続ソースではなく一射スクリプトとしてまさしく位置付けられる
- Good: published_toフロントマターをschema設計時から入れられる
- Bad: SOW v2として新しく計画文書を起こす必要がある

### C: project-local wiki と global wiki を別プラグインとして分離

- Bad: 実装・メンテナンスが二重化する
- Bad: 共通ロジック（ingest/query/lint）のDRY原則に反する

## Decision Outcome

**Option B（wiki_root リゾルバーを設計に組み込んだ v2 一括実装）を採用**。

### wiki_root リゾルバー

優先順位（高→低）:

1. `--wiki <path>` フラグ
2. `$WIKI_ROOT` 環境変数
3. `{cwd}/.wiki/` が存在する場合
4. `~/.claude/wiki/`（global fallback）

全hook・全スキルが同一リゾルバーを使用する。解決したパスが存在しない場合は自動作成。

### recall の扱い

Stop hook導入後はrecallセッションが自動的にwikiに流れるため、recallを永続ingest
ソースにすると二重取り込みが発生する。

過去セッション（Stop hook導入前）の一括取り込みは **`wiki:bootstrap --before <date>`**
の一射スクリプトで対応する。同一session_idは冪等にスキップ。

### publish 層（sae）

wikiページを `sae create` でesaに出力する `wiki:publish` スキルを追加する。
出力後は `published_to` フロントマターにesa記事IDと公開日時を記録する。

### stale-published 検出

`wiki:lint` に新ルールを追加: `published_to` に記録済みで `mtime > published_at` の
ページをstale-publishedとして報告する。

### heptabase は先送り

corpusが20ページ未満の段階ではheptabase publishの実際の使用経路が不明なためYAGNI。
wikiが20ページを超えた段階であらためて判断する。

## Consequences

- Good: project-local wikiとglobal wikiを1つの実装で統一的に扱える
- Good: recallの二重取り込みを設計段階で回避できる
- Good: publish後のstale知識をlintで検出できる
- Good: 未実装のためv1との互換コストがゼロ
- Bad: SOW v2として計画文書を再起こしする必要がある（実施済み: 2026-04-14）
- Bad: headless呼び出しコストが累積する（pre-filterで90% 削減）

## Reassessment Triggers

- headless 呼び出しのコストを pre-filter で抑えきれなくなったとき
- wiki_root リゾルバーが解決できない配置 (複数リポ横断など) を求められたとき
