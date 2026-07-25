# Plan テンプレート

`/think` が Phase 3 の下書き `.claude/workspace/planning/YYYY-MM-DD-<slug>.plan.md` をこの骨格で生成する。`/issue` は両節をそのまま issue の Plan 節へ移設する。

## テンプレート

`{...}` は生成時に内容へ置き換える。下書きは次の 2 節だけで構成し、見出しと箇条書きの形を崩さない。build workflow は Plan 節を LLM 抽出で build.js の EXTRACT_SCHEMA に写し、U-NNN / T-NNN id の決定論クロスチェックで欠落と捏造を止めるため、抽出の安定は骨格の安定が担う。機械用の隠し block は置かない。

```markdown
## Plan

Outcome: {done 状態の 1 行。実装非依存、観測可能}
test_command: {テスト実行コマンド 1 行。例 cargo test / node --test tests/}
base: {plan を実装するブランチ (PR のベース)。指定が無ければ現在の checkout のブランチ}
reference_module: {既存の同形モジュールのルート。または null + この形が新規である理由}

### 参照モジュール

{reference_module が null のときはこの小節ごと省略する。}

- instances: {この形を既に共有する既存機能の数。2 以上なら「N 例目」と書く}
- files: {複製する各ファイルとその役割: `src/foo/list.tsx` 一覧画面}
- conventions: {後続 unit が維持する共有慣例: 合成する共有コンポーネント、フォーマット処理の置き場所、状態の渡し方}

### 前提

- {既存依存。path 単独か path + stable anchor: `src/storage/mod.rs` の `open_db`}

### U-001 {unit タイトル}

{goal の言い切り 1 行。この unit が届ける振る舞い}

- files: {`src/foo.rs`, `tests/foo.test.rs`}
- contract: {引用 1 行 + やりたいこと 1 行}
- seam: {seam unit にだけ true を書く。他の unit はこの行ごと省略する}

受け入れテスト。

- T-001 {条件と期待結果を 1 行で言い切る言明。テスト名になる}

## Backlog candidates

- {スコープ外に切り出す候補。1 件 1 行}
```

## ガイドライン

unit は実装順に並べる。依存が実装順を決めない unit 同士は、データモデル、型 interface、UX flow など変わりやすい判断を含むものを先に、機械的な変更だけのものを後に置く。レビューの注意が変更されやすい判断へ先に向き、判断が覆ったときの手戻りが小さくなる。各 field の上限は骨格に示した行数で、超過は文章の追加でなく分割で解消する。unit を割るか、backlog へ切り出す。検証可能な振る舞いが無い unit (docs / 設定) は「受け入れテスト。」の段落ごと省略する。id の採番、seam unit、テスト省略時の build の扱いの意味論は SKILL.md Phase 3 が持つ。

| フィールド | OK                                                 | NG                                   |
| ---------- | -------------------------------------------------- | ------------------------------------ |
| Outcome    | 検索結果が 1 秒以内に表示される                    | 検索を高速化する (観測不能)          |
| 前提       | `src/config.rs` の `load_config`                   | src/config.rs 内の実装詳細コメント   |
| contract   | `src/query.rs` の `search` に倣い limit 引数を足す | 新規シグネチャのコード片を書き下ろす |
| T-NNN      | 空クエリはエラーを返す                             | 正しく動くことを確認する             |
