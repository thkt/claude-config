# Progressive Enhancement

**Default approach**: Build simple → enhance progressively

## Core Philosophy

- **Root Cause**: "Why?" not "How to fix?"
- **Prevention > Patching**: Best solution prevents the problem
- **Simple > Complex**: Elegance = solving right problem

## Priority

1. **HTML** - Structure
2. **CSS** - Visual/layout
3. **JavaScript** - Only when necessary

## CSS-First Solutions

- **Layout**: Grid/Flexbox
- **Position**: Transform (no reflow)
- **Show/Hide**: visibility/opacity
- **Responsive**: Media/Container queries
- **State**: :target, :checked, :has()

## Example

```css
/* ✅ CSS Grid overlay */
.container { display: grid; }
.panel { grid-column: 1 / -1; grid-row: 1 / -1; }
```

## Apply for

Layout, positioning, show/hide, responsive, animations, visual states

## Remember

"The best code is no code" - If CSS can solve it, skip JS
