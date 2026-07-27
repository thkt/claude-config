# Plan テンプレート

`/think` が Phase 3 の下書き `.claude/workspace/planning/YYYY-MM-DD-<slug>.plan.md` をこの骨格で生成する。`/issue` は `## Plan` と `## Backlog candidates` の 2 節をそのまま issue の Plan 節へ移設する。

## テンプレート

`{...}` は生成時に内容へ置き換える。下書きは次の 2 節だけで構成し、見出しと箇条書きの形を崩さない。build workflow は Plan 節を LLM 抽出で build.js の EXTRACT_SCHEMA へ写し、U-NNN/T-NNN id の決定論クロスチェックで欠落と捏造を止める。骨格を崩すと、この抽出も崩れる。機械用の隠し block は置かない。

```markdown
## Plan

Outcome: {done 状態の 1 行。実装非依存、観測可能}
test_command: {テスト実行コマンド 1 行。例 cargo test / node --test tests/}
base: {plan を実装するブランチ (PR のベース)。指定が無ければ現在の checkout のブランチ}
reference_module: {既存の同形モジュールのルート。または null + この形が新規である理由}

### 参照モジュール

{reference_module が null のときはこの小節を丸ごと省略する。}

- instances: {この形を既に共有する既存機能の数。2 以上なら「N 例目」と書く}
- files: {複製する各ファイルとその役割 (`src/foo/list.tsx` 一覧画面)}
- conventions: {後続 unit が維持する共有慣例 (合成する共有コンポーネント、フォーマット処理の置き場所、状態の渡し方)}

### 前提

- {既存依存。path 単独か path + stable anchor (`src/storage/mod.rs` の `open_db`)}

### U-001 {unit タイトル}

{goal の言い切り 1 行。この unit が届ける振る舞い}

- files: {`src/foo.rs`, `tests/foo.test.rs`}
- contract: {引用 1 行 + やりたいこと 1 行}
- seam: {seam unit にだけ true を書く。他の unit はこの行を丸ごと省略する}

受け入れテスト。

- T-001 {条件と期待結果を 1 行で言い切る言明。テスト名になる}

## Backlog candidates

- {スコープ外に切り出す候補。1 件 1 行}
```

## ガイドライン

unit は実装順に並べる。依存が実装順を決めない unit 同士は、データモデル、型 interface、UX flow など変わりやすい判断を含むものを先に、機械的な変更だけのものを後に置く。レビューの注意が変わりやすい判断へ先に向き、判断が覆ったときの手戻りが小さくなる。各フィールドの上限は骨格に示した行数で、超過は文章の追加でなく分割で解消する。unit を割るか、backlog へ切り出す。検証可能な振る舞いが無い unit (docs/設定) は「受け入れテスト。」の段落を丸ごと省略する。id の採番、seam unit、テストを省いた unit を build がどう扱うかは、SKILL.md Phase 3 が定める。

行数の上限は物理行の数を指し、1 文に収める指定ではない。抽出は見出しと id の照合だけで文境界を見ないので、Outcome と goal は節が 3 つ以上になったら行を増やさず 2 文に割る。1 文へ詰めると連体修飾が主語の前に積み上がり、述語に着くまで何の話か読めない。たとえば「fix stage が自己申告した fixed が post-fix diff 再判定で resolved/reopened に分類され、reopened が workflow 結果に現れる」は 3 節を 1 文に詰めている。これを「fix stage が fixed と自己申告した項目は、post-fix diff 再判定で resolved か reopened に分類される。reopened は workflow 結果に現れる」と割る。T-NNN はテスト名として逐語使用されるので 1 文のままにする。

| フィールド | OK                                                     | NG                                   |
| ---------- | ------------------------------------------------------ | ------------------------------------ |
| Outcome    | 検索結果が 1 秒以内に表示される                        | 検索を高速化する (観測不能)          |
| 前提       | `src/config.rs` の `load_config`                       | src/config.rs 内の実装詳細コメント   |
| contract   | `src/query.rs` の `search` に合わせて limit 引数を足す | 新規シグネチャのコード片を書き下ろす |
| T-NNN      | 空クエリはエラーを返す                                 | 正しく動くことを確認する             |
