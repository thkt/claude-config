# フロントエンド taint: HTML と属性の sink

sink がマークアップまたは属性を document へ書き込む taint パターン。regex マッチングを超えるデータフロー理解が必要で、guardrails の静的ルールを補完する。

## 1. サニタイザなしの dangerouslySetInnerHTML

ユーザー入力、API レスポンス、URL パラメータから `dangerouslySetInnerHTML={{ __html: value }}` へ流れる。

| チェック           | 問い                                                                               |
| ------------------ | ---------------------------------------------------------------------------------- |
| サニタイザがあるか | 代入前に `DOMPurify.sanitize()` 等が呼ばれているか                                 |
| サニタイザ設定     | サニタイザ設定が危険なタグ (`<script>`, `<iframe>`, `<object>`) を許可していないか |
| バイパスの可能性   | 条件分岐やエラーハンドリングでサニタイザをスキップできるか                         |

```tsx
// 脆弱: サニタイズされていない API レスポンス
<div dangerouslySetInnerHTML={{ __html: apiResponse.body }} />

// 安全: 利用前にサニタイズ
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(apiResponse.body) }} />
```

## 2. 関数引数から DOM メソッドへ

関数パラメータやコールバック引数から `innerHTML`, `outerHTML`, `insertAdjacentHTML()`, `document.write()` へ流れる。

| チェック           | 問い                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| 呼び出し元監査済み | すべての呼び出し元が安全 (サニタイズ済みまたはリテラル) な値を渡しているか |
| 型による強制       | 関数シグネチャが入力型を制限しているか (例: branded type)                  |
| 境界でサニタイズ   | 呼び出し元責務ではなく、関数境界でサニタイズが適用されているか             |

```ts
// 脆弱: 任意の呼び出し元がサニタイズなしの入力を渡せる
function renderContent(html: string) {
  container.innerHTML = html;
}

// 安全: 境界でサニタイズ
function renderContent(html: string) {
  container.innerHTML = DOMPurify.sanitize(html);
}
```

## 3. javascript: URL を持つ href 変数

ユーザー入力、データベース値、API レスポンスから `<a href={variable}>` や `location.href = variable` へ流れる。

| チェック                  | 問い                                                                 |
| ------------------------- | -------------------------------------------------------------------- |
| プロトコル バリデーション | URL が `https://`, `http://`, `/` のいずれかで始まるか確認しているか |
| javascript: ブロック      | `javascript:` プロトコルが明示的にブロックされているか               |
| data: ブロック            | `data:` プロトコルが明示的にブロックされているか                     |

```tsx
// 脆弱: userProfile.website は "javascript:alert(1)" にもなりうる
<a href={userProfile.website}>Visit</a>;

// 安全: プロトコル許可リスト
function safeHref(url: string): string {
  const parsed = new URL(url, location.origin);
  if (!["https:", "http:"].includes(parsed.protocol)) return "#";
  return parsed.href;
}
```
