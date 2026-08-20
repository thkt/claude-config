# Frontend Taint: HTML and Attribute Sinks

Taint patterns whose sink writes markup or an attribute into the document. These require data flow understanding beyond regex pattern matching and complement the guardrails static rules.

### 1. dangerouslySetInnerHTML without Sanitizer

Flows from user input, an API response, or a URL parameter into `dangerouslySetInnerHTML={{ __html: value }}`.

| Check              | Question                                                                         |
| ------------------ | -------------------------------------------------------------------------------- |
| Sanitizer present? | Is `DOMPurify.sanitize()` or equivalent called before assignment?                |
| Sanitizer config?  | Does sanitizer config allow dangerous tags (`<script>`, `<iframe>`, `<object>`)? |
| Bypass possible?   | Can the sanitizer be skipped via conditional logic or error handling?            |

```tsx
// VULNERABLE: unsanitized API response
<div dangerouslySetInnerHTML={{ __html: apiResponse.body }} />

// SAFE: sanitized before use
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(apiResponse.body) }} />
```

### 2. Function Argument to DOM Method

Flows from a function parameter or a callback argument into `innerHTML`, `outerHTML`, `insertAdjacentHTML()`, or `document.write()`.

| Check                  | Question                                                                     |
| ---------------------- | ---------------------------------------------------------------------------- |
| Caller audited?        | Are all call sites passing safe (sanitized or literal) values?               |
| Type enforced?         | Does the function signature restrict input type (e.g., branded type)?        |
| Sanitizer at boundary? | Is sanitization applied at the function boundary, not caller responsibility? |

```ts
// VULNERABLE: any caller can pass unsanitized input
function renderContent(html: string) {
  container.innerHTML = html;
}

// SAFE: sanitization at boundary
function renderContent(html: string) {
  container.innerHTML = DOMPurify.sanitize(html);
}
```

### 3. href Variable with javascript: URL

Flows from user input, a database value, or an API response into `<a href={variable}>` or `location.href = variable`.

| Check                | Question                                                        |
| -------------------- | --------------------------------------------------------------- |
| Protocol validated?  | Is the URL checked to start with `https://`, `http://`, or `/`? |
| javascript: blocked? | Is `javascript:` protocol explicitly blocked?                   |
| data: blocked?       | Is `data:` protocol explicitly blocked?                         |

```tsx
// VULNERABLE: userProfile.website could be "javascript:alert(1)"
<a href={userProfile.website}>Visit</a>;

// SAFE: protocol allowlist
function safeHref(url: string): string {
  const parsed = new URL(url, location.origin);
  if (!["https:", "http:"].includes(parsed.protocol)) return "#";
  return parsed.href;
}
```
