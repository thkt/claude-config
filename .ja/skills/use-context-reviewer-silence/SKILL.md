---
name: use-context-reviewer-silence
description: サイレント失敗の検出。セキュリティは use-context-reviewer-security、可読性は use-context-reviewer-readability に使う。
when_to_use: silent failure, empty catch, エラーハンドリング, 握りつぶし, swallowed error
allowed-tools: Read Task Bash(ugrep:*) Bash(bfs:*)
agent: reviewer-silence
context: fork
user-invocable: false
---

# サイレント失敗レビュー

## 検出

| ID  | パターン                             | 修正                                              |
| --- | ------------------------------------ | ------------------------------------------------- |
| SF1 | `catch (e) {}`                       | `catch (e) { logger.error(e); throw }`            |
| SF1 | `catch (e) { console.log(e) }`       | ユーザーへのフィードバック + コンテキスト ログ    |
| SF2 | `.then(fn)` で `.catch()` なし       | `.catch()` 追加または try/catch を使う            |
| SF2 | `async () => { await fn() }`         | try/catch でラップしエラーを扱う                  |
| SF3 | エラー UI 状態なし                   | error boundary、フィードバック コンポーネント追加 |
| SF4 | `value ?? defaultValue` のサイレント | フォールバック使用時にログ                        |
| SF4 | `data?.nested?.value`                | 想定外の null をチェックして報告                  |
| SF5 | `catch { return defaultValue }`      | デフォルトを返す前に根本原因をログ                |
| SF5 | `config.x \|\| fallback`             | 設定をバリデーション、欠落キーは warn             |

## 参照ファイル

| トピック  | ファイル                                             |
| --------- | ---------------------------------------------------- |
| Detection | ${CLAUDE_SKILL_DIR}/references/detection-patterns.md |
