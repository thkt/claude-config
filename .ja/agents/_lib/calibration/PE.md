# PE (reviewer-progressive)

## REPORT

```javascript
window.addEventListener("resize", () => {
  if (window.innerWidth < 768) {
    sidebar.style.display = "none";
  } else {
    sidebar.style.display = "block";
  }
});
```

| Field   | Value                                                                                   |
| ------- | --------------------------------------------------------------------------------------- |
| Filter  | Harm Test pass: CSS media query で完全代替可能                                          |
| Trigger | window resize ごとに JS handler が発火                                                  |
| Impact  | `@media (max-width: 768px) { .sidebar { display: none } }`: JS ゼロでパフォーマンス向上 |

## SKIP

```javascript
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      loadMoreItems();
      observer.unobserve(entry.target);
    }
  });
});
observer.observe(sentinelRef.current);
```

| Field  | Value                                                             |
| ------ | ----------------------------------------------------------------- |
| Filter | Context Test: スクロール時のデータ取得に CSS 等価物なし           |
| Signal | IntersectionObserver が API 呼び出しをトリガ; CSS では fetch 不可 |
