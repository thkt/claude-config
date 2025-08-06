# The Art of Readable Code

**Default mindset**: Code should be easy to understand - Dustin Boswell & Trevor Foucher

## Core Principle

**"Code should be written to minimize the time it would take for someone else to understand it"**

- That "someone else" might be you six months later
- Understanding time > writing time

## Key Practices

### 1. Making Code Easy to Understand

#### Names That Can't Be Misconstrued

```typescript
// ❌ Ambiguous
results.filter(x => x > LIMIT)  // Greater than or equal to?

// ✅ Clear intent
results.filter(x => x >= MIN_ITEMS_TO_DISPLAY)
```

#### Prefer Concrete over Abstract

```typescript
// ❌ Abstract
processData(data)

// ✅ Concrete
validateUserRegistration(formData)
```

### 2. Simplifying Loops and Logic

#### Make Control Flow Obvious

```typescript
// ❌ Complex nesting
if (user) {
  if (user.isActive) {
    if (user.hasPermission) {
      // do something
    }
  }
}

// ✅ Early returns
if (!user) return
if (!user.isActive) return
if (!user.hasPermission) return
// do something
```

#### Minimize Nesting

- Use guard clauses
- Extract complex conditions to well-named functions
- Prefer early returns

### 3. Reorganizing Your Code

#### Extract Unrelated Subproblems

```typescript
// ✅ Each function does one thing
function getActiveUsers(users: User[]) {
  return users.filter(isActiveUser)
}

function isActiveUser(user: User): boolean {
  return user.status === 'active' && user.lastLogin > thirtyDaysAgo()
}
```

#### One Task at a Time

- Functions should do one thing
- If explaining requires "and", split it
- Separate "what" from "how"

### 4. Code Should Be "Obviously Correct"

#### Make Your Code Look Like Your Intent

```typescript
// ❌ Intent unclear
const p = products.filter(p => p.price > 0 && p.stock)

// ✅ Intent obvious
const availableProducts = products.filter(product =>
  product.price > 0 &&
  product.stock > 0
)
```

### 5. Key Questions Before Writing

Ask yourself:

1. "What is the easiest way to understand this?"
2. "What would confuse someone reading this?"
3. "Can I make the intent more obvious?"

## Practical Application

### Variable Naming

- **Specific > Generic**: `userEmail` not `data`
- **Searchable**: `MAX_RETRY_COUNT` not `7`
- **Pronounceable**: `customer` not `cstmr`

### Function Design

- **Small & Focused**: 5-10 lines ideal
- **Descriptive Names**: `calculateTotalPrice()` not `calc()`
- **Consistent Level**: Don't mix high and low-level operations

### Comments

- **Why, not What**: Explain decisions, not mechanics
- **Update or Delete**: Outdated comments are worse than none
- **Code First**: If you need to explain what, rewrite the code

## The Final Test

**"Would a new team member understand this in < 1 minute?"**

If not, simplify further.

## Remember

- Clarity beats cleverness
- Future you is a different person
- Reading happens more than writing
