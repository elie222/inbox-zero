---
name: llm-test
description: Guidelines for writing tests for LLM-related functionality
---
# LLM Testing Guidelines

Tests for LLM-related functionality should follow these guidelines to ensure consistency and reliability.

## Test File Structure

1. Place all LLM-related tests in `apps/web/__tests__/`:

   ```
   apps/web/__tests__/
   │ └── your-feature.test.ts
   │ └── another-feature.test.ts
   └── ...
   ```

2. Basic test file template:

   ```typescript
   import { describe, expect, test, vi, beforeEach } from "vitest";
   import { yourFunction } from "@/utils/ai/your-feature";

   // Run with: pnpm test-ai TEST

   vi.mock("server-only", () => ({}));

   const TIMEOUT = 15_000;

   // Skip tests unless explicitly running AI tests
   const isAiTest = process.env.RUN_AI_TESTS === "true";

   describe.runIf(isAiTest)("yourFunction", () => {
     beforeEach(() => {
       vi.clearAllMocks();
     });

     test("test case description", async () => {
       // Test implementation
     });
   }, TIMEOUT);
   ```

## Helper Functions

1. Always create helper functions for common test data:

   ```typescript
   function getUser() {
     return {
       email: "user@test.com",
       aiModel: null,
       aiProvider: null,
       aiApiKey: null,
       about: null,
     };
   }

   function getTestData(overrides = {}) {
     return {
       // Default test data
       ...overrides,
     };
   }
   ```

## Test Cases

1. Include these standard test cases:

   - Happy path with expected input
   - Error handling
   - Edge cases (empty input, null values)
   - Different user configurations
   - Various input formats

2. Example test structure:

   ```typescript
   test("successfully processes valid input", async () => {
     const result = await yourFunction({
       input: getTestData(),
       user: getUser(),
     });
     expect(result).toMatchExpectedFormat();
   });

   test("handles errors gracefully", async () => {
     const result = await yourFunction({
       input: getTestData({ invalid: true }),
       user: getUser(),
     });
     expect(result.error).toBeDefined();
   });
   ```

## Best Practices

1. Set appropriate timeouts for LLM calls:

   ```typescript
   const TIMEOUT = 15_000;
   test("handles long-running LLM operations", async () => {
     // ...
   }, TIMEOUT);
   ```

2. Use descriptive console.debug for generated content:

   ```typescript
   console.debug("Generated content:\n", result.content);
   ```

3. Do not mock the LLM call. We want to call the actual LLM in these tests.

4. Test both AI and non-AI paths:
   ```typescript
   test("returns unchanged when no AI processing needed", async () => {
     const input = getTestData({ requiresAi: false });
     const result = await yourFunction(input);
     expect(result).toEqual(input);
   });
   ```

5. Use existing helpers from `@/__tests__/helpers.ts`:
  - `getEmailAccount(overrides?)` - Creates EmailAccountWithAI objects
  - `getEmail(overrides?)` - Creates EmailForLLM objects  
  - `getRule(instructions, actions?)` - Creates rule objects
  - `getMockMessage(options?)` - Creates mock message objects
  - `getMockExecutedRule(options?)` - Creates executed rule objects

  Always prefer using existing helpers over creating custom ones.

## Running Tests

Run AI tests with:

   ```bash
   pnpm test-ai your-feature
   ```

## Eval Tests (Cross-Model Comparison)

Eval tests compare AI function output across multiple models using binary pass/fail scoring.

### File naming

Place eval test files in `apps/web/__tests__/eval/` (e.g., `categorize-senders.test.ts`).

### Template

```typescript
import { describe, test, expect, vi, afterAll } from "vitest";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { evalReporter } from "@/__tests__/eval/reporter";
import { yourFunction } from "@/utils/ai/your-feature";

// pnpm test-ai eval-your-feature
// Multi-model: EVAL_MODELS=all pnpm test-ai eval-your-feature

vi.mock("server-only", () => ({}));

const isAiTest = process.env.RUN_AI_TESTS === "true";
const TIMEOUT = 15_000;

describe.runIf(isAiTest)("Eval: Your Feature", () => {
  describeEvalMatrix("feature", (model, emailAccount) => {
    test("case description", async () => {
      const result = await yourFunction({ emailAccount, ... });

      const pass = result === expected;
      evalReporter.record({ testName: "case", model: model.label, pass });

      expect(result).toBe(expected);
    }, TIMEOUT);
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});
```

### Subjective eval with LLM-as-judge

For outputs without a single correct answer (e.g., email drafts), use binary pass/fail judging:

```typescript
import { judgeMultiple, CRITERIA } from "@/__tests__/eval/judge";

test("draft quality", async () => {
  const result = await draftReply({ emailAccount, ... });

  const { allPassed, results } = await judgeMultiple({
    input: "original email content",
    output: result.draft,
    criteria: [CRITERIA.ACCURACY, CRITERIA.TONE, CRITERIA.NO_HALLUCINATION],
  });

  evalReporter.record({
    testName: "draft quality",
    model: model.label,
    pass: allPassed,
    criteria: results,
  });

  expect(allPassed).toBe(true);
}, 30_000);
```

### Running

```bash
# Single model (default env-configured model)
pnpm test-ai eval-your-feature

# All preset models
EVAL_MODELS=all pnpm test-ai eval-your-feature

# Save report to file
EVAL_REPORT_PATH=eval-results/report.md EVAL_MODELS=all pnpm test-ai eval-your-feature
```

### Eval utilities

- `describeEvalMatrix(name, fn)` — runs tests across all models in `EVAL_MODELS`
- `evalReporter.record(result)` — records pass/fail for the comparison report
- `judgeBinary({ input, output, criterion })` — binary LLM-as-judge evaluation
- `judgeMultiple({ input, output, criteria })` — evaluates multiple criteria
- `CRITERIA.*` — preset criteria: ACCURACY, COMPLETENESS, TONE, CONCISENESS, NO_HALLUCINATION, CORRECT_FORMAT
