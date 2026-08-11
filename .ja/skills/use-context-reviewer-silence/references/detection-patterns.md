# 検出パターン

## 検索コマンド

| パターン             | コマンド                                                      |
| -------------------- | ------------------------------------------------------------- |
| 空の catch           | `rg "catch\s*\([^)]*\)\s*\{\s*\}" --glob "*.{ts,tsx,js,jsx}"` |
| コメントのみの catch | `rg "catch\s*\([^)]*\)\s*\{\s*//.*\s*\}" --glob "*.{ts,tsx}"` |
| catch なしの Promise | `rg "\.then\([^)]+\)$" --glob "*.{ts,tsx,js,jsx}"`            |
| console のみの処理   | `rg "catch.*console\.(log\|error\|warn)" --glob "*.{ts,tsx}"` |
| Fire and forget      | `rg "(fetch\|axios\|api)\([^)]+\)$" --glob "*.{ts,tsx}"`      |

## パターン例

| 悪いパターン                          | 問題                               | 良い代替                             |
| ------------------------------------- | ---------------------------------- | ------------------------------------ |
| `catch (e) { }`                       | サイレント失敗                     | ログ + 再送出または処理              |
| `catch (error) { // TODO }`           | TODO が放置される                  | 今実装するか catch を消す            |
| `catch (_) { }`                       | アンダースコアでも意味は変わらない | 上と同じ                             |
| `catch (e) { console.log(e) }`        | ログするだけで処理しない           | ユーザー フィードバック + エラー処理 |
| `fetchUser(id).then(u => setUser(u))` | エラーハンドリングなし             | `.catch(handleError)` を追加         |

## 重大度の分類

| パターン             | 重大度   | 対応                          |
| -------------------- | -------- | ----------------------------- |
| 空の catch ブロック  | Critical | 即時修正                      |
| catch なしの Promise | Critical | エラーハンドリングを追加      |
| console.log のみ     | High     | ユーザー フィードバックを追加 |
| Fire and forget      | High     | await または .catch を追加    |
| Error Boundary 欠落  | High     | 主要セクションをラップ        |

## ESLint ルール

```json
{
  "rules": {
    "no-empty": ["error", { "allowEmptyCatch": false }],
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error"
  }
}
```
