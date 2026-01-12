# write-tests

Write unit tests for utility functions and backend logic. Mock all external dependencies.

## Critical Rules

1. **ONLY test logic** — Utility functions, data transformations, business rules
2. **NEVER test UI** — No component rendering, no "renders correctly" tests
3. **MOCK everything external** — Prisma, APIs, server-only, third-party services
4. **CO-LOCATE tests** — Place `foo.test.ts` next to `foo.ts`
5. **Follow `.cursor/rules/testing.mdc`** — Use existing patterns and helpers

## What to Test (High Priority)

- Business logic and conditional flows
- Data transformations and parsing
- Edge cases and error handling
- Input validation logic
- Complex utility functions
- Frontend logic (reducers, state machines, pure functions extracted from components)

## SKIP — What NOT to Test

**Do NOT write tests for any of these:**

| Skip | Example |
|------|---------|
| React component rendering | "component renders without crashing" |
| UI appearance | "button has correct class/style" |
| Icon/label mappings | "newsletter group uses newspaper icon" |
| Static config values | "default timeout is 5000" |
| Simple type re-exports | Testing a type alias exists |
| Trivial getters | `getName() { return this.name }` |
| Simple Zod schemas | `z.object({ name: z.string() })` — only test `refine`/`superRefine` with complex logic |

## Mocking Patterns

```ts
// Server-only
vi.mock("server-only", () => ({}));

// Prisma
import prisma from "@/utils/__mocks__/prisma";
vi.mock("@/utils/prisma");

// Use existing helpers
import { getEmail, getEmailAccount, getRule } from "@/__tests__/helpers";
```

## Workflow

### Step 0: Determine Scope

Auto-detect: staged → branch diff → specified files

```bash
git diff --cached --name-only  # or main...HEAD
```

### Step 1: Identify Test Targets

Look for functions with:
- Conditional logic (if/else, switch)
- Data transformation
- Error handling paths
- Multiple return scenarios

### Step 2: Create Test File

Place next to source: `utils/example.ts` → `utils/example.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { yourFunction } from "./example";

vi.mock("server-only", () => ({}));

describe("yourFunction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles happy path", () => {
    // Test main success case
  });

  it("handles edge case", () => {
    // Test boundary conditions
  });

  it("handles error case", () => {
    // Test error paths
  });
});
```

### Step 3: Run Tests

```bash
cd apps/web && pnpm test --run
```

Do NOT use sandbox for test commands.

## Test Quality Checklist

Before finishing, verify each test:
- [ ] Tests behavior, not implementation
- [ ] Would catch a real bug if logic changed
- [ ] Doesn't duplicate another test
- [ ] Isn't testing framework/library code

## Step 4: Summary

After writing tests, provide a brief summary:

```
Tests written for `utils/example.ts`:

Covered:
- validateInput: null handling, invalid format, valid input
- transformData: empty array, nested objects, error case

Not covered (and why):
- getConfig: static values only, no logic to test
- CONSTANTS export: no behavior to test

Run coverage? (y/n)
```

## Optional: Coverage

If requested, run coverage to identify gaps:

```bash
cd apps/web && pnpm test --run --coverage -- path/to/file.test.ts
```

