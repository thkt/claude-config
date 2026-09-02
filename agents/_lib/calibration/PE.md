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

| Field   | Value                                                                                    |
| ------- | ---------------------------------------------------------------------------------------- |
| Filter  | Harm Test pass - CSS media query replaces this entirely                                  |
| Trigger | Every window resize fires JS handler                                                     |
| Impact  | `@media (max-width: 768px) { .sidebar { display: none } }` - zero JS, better performance |

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

| Field  | Value                                                         |
| ------ | ------------------------------------------------------------- |
| Filter | Context Test: no CSS equivalent for data fetching on scroll   |
| Signal | IntersectionObserver triggers API call; CSS cannot fetch data |
