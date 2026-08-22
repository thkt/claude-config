# フロントエンド taint: オリジンをまたぐデータ、ナビゲーション、ストレージ

source がオリジン境界をまたぐか、sink がナビゲーションまたは資格情報の永続化を行う taint パターン。regex マッチングを超えるデータフロー理解が必要で、guardrails の静的ルールを補完する。

## 1. postMessage の origin 検証

`window.addEventListener('message', handler)` から、ハンドラ内の DOM 操作、state 更新、ナビゲーションへ流れる。

| チェック            | 問い                                                             |
| ------------------- | ---------------------------------------------------------------- |
| origin 検証あり     | ハンドラが `event.origin` を許可リストと照合しているか           |
| origin 厳密性       | `.includes()` や `.startsWith()` ではなく `===` で比較しているか |
| data バリデーション | `event.data` が利用前にバリデーション/型付けされているか         |

```ts
// 脆弱: 任意の origin が data を注入できる
window.addEventListener("message", (e) => setState(e.data));

// 安全: 厳密な origin 検証
window.addEventListener("message", (e) => {
  if (e.origin !== "https://trusted.example.com") return;
  setState(schema.parse(e.data));
});
```

## 2. URL パラメータからリダイレクトへのフロー

`URLSearchParams`/`location.search`/`location.hash`/ルートパラメータから、`location.href`/`location.replace()`/`location.assign()`/`window.open()` へ流れる。

| チェック       | 問い                                                             |
| -------------- | ---------------------------------------------------------------- |
| 許可リスト     | リダイレクト先は許可ドメインのリストでバリデーションされているか |
| 相対のみか     | URL は相対に強制されているか (プロトコルなし、`//` なし)         |
| プロトコル検査 | `javascript:` や `data:` プロトコルがブロックされているか        |

```ts
// 脆弱: open redirect
location.href = new URLSearchParams(location.search).get("next");

// 安全: URL をパースし origin と pathname をバリデーション
const next = new URLSearchParams(location.search).get("next");
if (next) {
  const url = new URL(next, location.origin);
  if (url.origin === location.origin && ALLOWED_PATHS.some((p) => url.pathname.startsWith(p))) {
    location.href = url.pathname;
  }
}
```

## 3. localStorage 内の JWT

認証レスポンスやトークンリフレッシュから `localStorage.setItem('token', jwt)` や `sessionStorage.setItem('auth', jwt)` へ流れる。

| チェック          | 問い                                                                      |
| ----------------- | ------------------------------------------------------------------------- |
| 保存方式          | localStorage/sessionStorage の代わりに `httpOnly` cookie が使われているか |
| XSS 露出          | XSS 緩和 (CSP、サニタイズ) があり、トークン窃取リスクが下がっているか     |
| トークン スコープ | トークンに XSS 経由で露出するセンシティブな claim が含まれていないか      |

```ts
// 脆弱: 任意の XSS が localStorage.getItem('token') で読み出せる
localStorage.setItem("token", response.jwt);

// 安全: サーバーが Set-Cookie: token=jwt; HttpOnly; Secure; SameSite=Strict をセット
// クライアントはトークンを扱わず、cookie が自動送信される
```
