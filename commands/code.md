---
name: code
description: 計画に基づいてコードを記述（TDD推奨）
priority: high
suitable_for:
  scale: [small, medium, large]
  type: [feature, refactor, fix]
  understanding: "≥ 70%"
  urgency: [low, medium]
aliases: [implement, impl]
timeout: 120
context:
  files_changed: "any"
  lines_changed: "any"
  new_features: true
  breaking_changes: true
---

# /code - Code Implementation

## Purpose

Perform actual code implementation based on the plan.

## Usage Modes

- **Standalone**: Implement specific features or bug fixes
- **Workflow**: Code based on `/research` results, then proceed to `/test`

## Prerequisites (Workflow Mode)

- SOW created in `/think`
- Technical research completed in `/research`
- For standalone use, implementation details must be clear

## Implementation Principles

### Applied Development Rules

- [@~/.claude/rules/development/PROGRESSIVE_ENHANCEMENT.md] - CSS-first approach for UI
- [@~/.claude/rules/development/READABLE_CODE.md] - Code readability and clarity
- [@~/.claude/rules/development/CONTAINER_PRESENTATIONAL.md] - React component patterns

### Principle Hierarchy

**TDD/RGRC is the primary implementation cycle**. Within this cycle:

- **Red & Green phases**: Focus on functionality only
- **Refactor phase**: Apply SOLID and DRY principles
- **Commit phase**: Save stable state

This ensures that code first works (TDD), then becomes clean and maintainable (SOLID/DRY).

### 1. Test-Driven Development (TDD) as t_wada would

**Goal**: "Clean code that works" (動作するきれいなコード) - Ron Jeffries

#### RGRC Cycle (Red-Green-Refactor-Commit)

1. **Red**: Write failing test first
   - Verify correct failure (wrong failure = wrong understanding)
   - The test documents your understanding before implementation

2. **Green**: Minimal code to pass
   - "Sins may be committed" - quick & dirty is OK here
   - Resist adding extra features
   - Focus on making it work, not perfect

3. **Refactor**: Improve without breaking
   - Remove duplication (DRY principle)
   - Apply SOLID principles
   - Extract meaningful abstractions
   - Keep tests green throughout

4. **Commit**: Save progress (manual execution by user)
   - Stable state ready for commit
   - User executes git commands manually

#### TodoWrite Integration for TDD

Update status at each phase start and completion:

- Phase start: Mark as ❌ (in progress)
- Phase completion: Mark as ✅ (completed)
- Next phase: Switch to ❌ (in progress)

```md
# Scenarios
1. ⏳ User can register with valid email
2. ⏳ Registration fails with invalid email

# Current RGRC (Scenario 1)
1.1 ✅ Red: Write test for user registration
1.2 ❌ Green: Implement minimal registration logic  ← Active
1.3 ⏳ Refactor: Extract validation, improve naming
1.4 ⏳ Commit: Save progress
```

### 2. SOLID Principles During Implementation

Apply during Refactor phase:

- **SRP**: Each class/function has one reason to change
- **OCP**: Extend functionality without modifying existing code
- **LSP**: Derived classes must be substitutable for base classes
- **ISP**: Clients shouldn't depend on unused interfaces
- **DIP**: Depend on abstractions, not concrete implementations

### 3. DRY (Don't Repeat Yourself) Principle

**"Every piece of knowledge must have a single, unambiguous, authoritative representation"**

- Extract repeated logic into functions
- Create configuration objects for repeated values
- Use composition for repeated structure
- Avoid copy-paste programming

### 4. Consistency with Existing Code

- Follow coding conventions
- Utilize existing patterns and libraries
- Maintain naming convention consistency

## Implementation Process

### 1. Pre-implementation Verification

- Reconfirm implementation plan
- Identify necessary files
- Verify dependencies

### 2. Code Implementation with TDD

Follow the RGRC cycle defined above:

- **Red**: Write failing test first
- **Green**: Minimal code to pass
- **Refactor**: Apply SOLID and DRY principles
- **Commit**: Save stable state

### 3. Quality Checks

**Note**: If project has hooks configured, quality checks may run automatically.

**Detect project-specific quality commands:**

- Check CLAUDE.md or .claude/project.md first
- Look in package.json, Makefile, README.md
- Common patterns: lint, typecheck, test

**Execute quality checks using Bash tool:**

- Run detected commands (e.g., `npm run lint`, `npm run typecheck`)
- Show output to user
- Fix any errors or warnings found
- Re-run until all checks pass

**If not found:** Ask user and suggest documenting in CLAUDE.md

### 4. Functionality Verification

- Verify on development server
- Validate edge cases
- Check performance

## Key Practices

- Follow security best practices
- Implement proper error handling
- Consider accessibility requirements

## Definition of Done

Implementation is considered complete when:

- All planned RGRC cycles are finished
- All tests (new and existing) are passing
- Quality checks are clean:
  - No lint errors/warnings (or acceptable ones documented)
  - No type errors
  - Code follows project conventions
- Changes are committed with clear messages
- TodoWrite tasks marked as completed

If any of these criteria are not met, continue working or document blockers before proceeding.

## Next Steps

- **Workflow mode**: After implementation complete, proceed to `/test` for comprehensive testing
- **Standalone mode**: Proceed to testing or other work as needed
