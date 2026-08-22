# Frontend Taint: Cross-Origin Data, Navigation, and Storage

Taint patterns whose source crosses an origin boundary or whose sink navigates or persists a credential. These require data flow understanding beyond regex pattern matching and complement the guardrails static rules.

## 1. postMessage Origin Verification

Flows from `window.addEventListener('message', handler)` into DOM manipulation, a state update, or navigation inside the handler.

| Check           | Question                                                             |
| --------------- | -------------------------------------------------------------------- |
| Origin checked? | Does the handler verify `event.origin` against an allowlist?         |
| Origin strict?  | Is origin compared with `===`, not `.includes()` or `.startsWith()`? |
| Data validated? | Is `event.data` validated/typed before use?                          |

```ts
// VULNERABLE: any origin can inject data
window.addEventListener("message", (e) => setState(e.data));

// SAFE: strict origin verification
window.addEventListener("message", (e) => {
  if (e.origin !== "https://trusted.example.com") return;
  setState(schema.parse(e.data));
});
```

## 2. URL Parameter to Redirect Flow

Flows from `URLSearchParams`, `location.search`, `location.hash`, or route params into `location.href`, `location.replace()`, `location.assign()`, or `window.open()`.

| Check           | Question                                                                  |
| --------------- | ------------------------------------------------------------------------- |
| Allowlist?      | Is the redirect target validated against an allowlist of allowed domains? |
| Relative only?  | Is the URL forced to be relative (no protocol, no `//`)?                  |
| Protocol check? | Are `javascript:` and `data:` protocols blocked?                          |

```ts
// VULNERABLE: open redirect
location.href = new URLSearchParams(location.search).get("next");

// SAFE: parse URL and validate origin + pathname
const next = new URLSearchParams(location.search).get("next");
if (next) {
  const url = new URL(next, location.origin);
  if (url.origin === location.origin && ALLOWED_PATHS.some((p) => url.pathname.startsWith(p))) {
    location.href = url.pathname;
  }
}
```

## 3. JWT in localStorage

Flows from an authentication response or a token refresh into `localStorage.setItem('token', jwt)` or `sessionStorage.setItem('auth', jwt)`.

| Check         | Question                                                                          |
| ------------- | --------------------------------------------------------------------------------- |
| Storage type? | Is `httpOnly` cookie used instead of localStorage/sessionStorage?                 |
| XSS exposure? | Does the app have XSS mitigations (CSP, sanitization) to reduce token theft risk? |
| Token scope?  | Does the token contain sensitive claims that would be exposed via XSS?            |

```ts
// VULNERABLE: any XSS reads it back via localStorage.getItem('token')
localStorage.setItem("token", response.jwt);

// SAFE: server sets Set-Cookie: token=jwt; HttpOnly; Secure; SameSite=Strict
// The client handles no token; the cookie travels automatically
```
