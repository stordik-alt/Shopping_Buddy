# Shopping Buddy — Claude Code Instructions

## 1. Project Identity

**Project:** Shopping Buddy
**Repository:** `stordik-alt/Shopping_Buddy`

Shopping Buddy is a family shopping assistant focused initially on the Czech market.

The application helps households:

* manage household members and profiles
* manage shopping lists
* plan meals
* track prices and promotions
* compare stores
* manage budgets and expenses
* track purchases and history
* optimize shopping trips
* send useful notifications
* eventually provide AI-assisted shopping recommendations

The application should be designed so that the Czech implementation can later be extended internationally.

---

# 2. Source of Truth

Before making architectural or backend changes, inspect these documents:

1. `docs/00_PROJECT_CONTEXT.md`
2. `docs/01_CURRENT_STATE.md`
3. `docs/02_ARCHITECTURE.md`
4. `docs/03_DATABASE.md`
5. `docs/04_ROADMAP.md`
6. `docs/05_BUSINESS_RULES.md`
7. `docs/06_AI_RULES.md`
8. `docs/07_CHANGELOG.md`

Also inspect the actual implementation and database schema.

### Important

Documentation can become outdated.

When documentation conflicts with verified code or the live database:

1. inspect the implementation
2. verify the database schema
3. determine the actual current behavior
4. update the documentation if appropriate

Never blindly implement an old document.

Historical documents such as older `docs/01...15` feature-stage documents should not be deleted or rewritten unless explicitly requested.

---

# 3. Git Branch Strategy

## Stable branch

`main`

`main` represents the stable project state.

Do not make backend development changes directly on `main`.

## Backend development branch

`v0/backend`

All current backend development should happen on:

```text
v0/backend
```

The branch should originate from the latest `main`.

### Rules

Before starting work:

1. inspect the current branch
2. inspect the latest `main`
3. ensure `v0/backend` is based on the current `main`
4. switch/use `v0/backend` for backend development

If `v0/backend` does not exist, create it from the latest `main`.

Do not create backend work from an outdated branch.

### Old branch

`V0/continue-frontend`

This branch is historical/obsolete unless explicitly requested.

Do not use it as the current backend development branch.

Do not introduce new development there.

### Pull requests

Backend work should follow:

```text
main
  ↓
v0/backend
  ↓
development / testing
  ↓
pull request
  ↓
main
```

Do not bypass this workflow unless explicitly instructed.

---

# 4. Technology Stack

Current stack:

* Next.js 16.3.3
* React 19
* TypeScript 5.7.3
* Tailwind CSS 4.x
* shadcn/ui
* lucide-react
* pnpm 12.3.4
* Neon PostgreSQL 18
* Drizzle ORM
* Neon Auth

Do not introduce a different backend architecture without a clear technical reason.

### Explicitly do NOT reintroduce

* Python/FastAPI backend
* SQLite as the production database
* a second independent backend
* unnecessary ORM replacement
* unnecessary state-management framework
* AI SDK/Gateway/provider integration before the AI phase

---

# 5. Engineering Principles

The most important principles are:

1. Inspect before modifying.
2. Preserve working functionality.
3. Prefer small, coherent changes.
4. Keep business logic outside UI components.
5. Keep calculations deterministic and testable.
6. Do not duplicate business logic in multiple places.
7. Do not introduce unnecessary dependencies.
8. Do not hide errors.
9. Do not use `any` unless there is a documented technical reason.
10. Keep code readable.
11. Add comments to important or non-obvious logic.

Important code should explain its purpose.

For example:

```ts
// Calculate the remaining household budget after confirmed expenses.
const remainingBudget = budgetLimit - totalExpenses;
```

Comments should explain **why** something is done when the reason is not obvious, not simply repeat the code.

---

# 6. Backend Architecture

Backend logic should be organized into clear layers.

Prefer:

```text
UI
 ↓
Server Actions / Route Handlers
 ↓
Domain / Business Logic
 ↓
Data Access
 ↓
Drizzle ORM
 ↓
Neon PostgreSQL
```

Do not put critical calculations directly inside React components.

Do not a
