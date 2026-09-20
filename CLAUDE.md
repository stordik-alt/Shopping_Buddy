# Shopping Buddy — Claude Code project instructions

## Source of truth
Before changing code, read:
1. `docs/00_PROJECT_CONTEXT.md`
2. `docs/01_CURRENT_STATE.md`
3. `docs/02_ARCHITECTURE.md`
4. `docs/03_DATABASE.md`
5. `docs/04_ROADMAP.md`
6. `docs/05_BUSINESS_RULES.md`
7. `docs/06_AI_RULES.md`
8. `docs/07_CHANGELOG.md`

The older `docs/01_...` through `docs/15_...` files are historical/feature-stage context. Do not delete or rewrite them unless explicitly requested. If they conflict with verified code or Neon schema, verify first and prefer the current implementation/schema.

## Current branch
Primary development branch: `V0/continue-frontend`.
Never assume the branch name; verify before destructive or release work.

## Current stack
- Next.js 16.3.3
- React 19
- TypeScript 5.7.3
- Tailwind CSS 4.x
- shadcn/ui
- lucide-react
- pnpm 12.3.4
- Neon PostgreSQL 18

Do not introduce Python/FastAPI/SQLite as the backend architecture. Use the existing Next.js/TypeScript application and Neon PostgreSQL unless a documented architecture decision changes this.

## Engineering rules
- Inspect existing code before creating new abstractions.
- Preserve working UI and behavior; make incremental changes.
- Do not replace mock data blindly. Migrate feature-by-feature to real persistence.
- Keep domain logic deterministic and testable.
- Do not put business-critical calculations only inside UI components.
- Keep code readable. Add concise comments for non-obvious logic and important business rules.
- Do not use `any` unless there is a documented reason.
- Do not hide TypeScript/build errors to make a change appear successful.
- Validate with lint/typecheck/build/tests that are actually configured in the repository.
- For database changes, create a migration and explain its purpose. Never silently destroy existing data.
- Never expose secrets, connection strings, API keys or credentials in source control.
- Do not implement scraping that bypasses CAPTCHA, authentication, access controls or other technical restrictions.

## Working method
For every substantial task:
1. Inspect relevant code and current data model.
2. State the files/components/schema affected.
3. Implement the smallest coherent change.
4. Validate.
5. Update `docs/07_CHANGELOG.md` when architecture, schema, business rules or roadmap status changes.
6. If the task reveals a mismatch between documentation and reality, update the relevant current-state document.

## Current priority
The project is moving from a mostly completed frontend prototype toward real Neon persistence. Do not jump to advanced AI/optimization features before the underlying structured data and persistence are reliable.

First priority sequence:
audit -> data-access layer -> authentication/session -> household/profile persistence -> shopping-list persistence -> budget/expenses -> products/prices/deals -> meal plans/history -> shared household -> AI -> optimization -> notifications -> global rollout.

## Definition of done
A feature is not complete merely because the UI renders. It must have:
- correct types
- correct persistence where applicable
- clear loading/error/empty states
- responsive mobile-first UI
- deterministic business logic
- validation
- no known regression in affected flows
- documentation updated when the architecture or behavior changes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
