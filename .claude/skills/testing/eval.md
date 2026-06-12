# Eval Tests (Cross-Model Comparison)

Eval tests compare AI function output across multiple models using binary pass/fail scoring.

## File Location

Place matrix or judge-based eval test files in `apps/web/__tests__/eval/` (e.g., `categorize-senders.test.ts`).
Place live AI regression tests that use `RUN_AI_TESTS` but do not use the eval helpers in `apps/web/__tests__/ai-regression/`.

## Template

```typescript
import { describe, test, expect, vi, afterAll } from "vitest";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { yourFunction } from "@/utils/ai/your-feature";

// pnpm test-ai eval/your-feature
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/your-feature

vi.mock("server-only", () => ({}));

const isAiTest = process.env.RUN_AI_TESTS === "true";
const TIMEOUT = 15_000;

describe.runIf(isAiTest)("Eval: Your Feature", () => {
  const evalReporter = createEvalReporter({ evalName: "your-feature" });

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

## Model Selection in Fixtures

- Do not pin per-user AI settings in eval fixtures unless the eval is explicitly about model-selection behavior.
- If you construct an `emailAccount` or `user` fixture yourself, keep `aiProvider`, `aiModel`, and `aiApiKey` as `null` so the eval uses the normal global/default AI path.
- Prefer the `emailAccount` provided by `describeEvalMatrix()` instead of overriding its user AI settings.

## Subjective Eval with LLM-as-Judge

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

## Running

```bash
# Single model (default env-configured model)
pnpm test-ai eval/your-feature

# All preset models
EVAL_MODELS=all pnpm test-ai eval/your-feature

# Specific models
EVAL_MODELS=gemini-2.5-flash,gpt-5.4-mini pnpm test-ai eval/your-feature

# Save report to file
EVAL_REPORT_PATH=eval-results/report.md EVAL_MODELS=all pnpm test-ai eval/your-feature

# Reuse unchanged eval/model results from the local result cache
EVAL_RESULT_CACHE=readwrite pnpm test-ai eval/your-feature
```

## Dashboard

Build a self-contained HTML dashboard from all recorded run history (model leaderboard, suite × model matrix, pass-rate trends, per-test drill-down with judge criteria, and spend):

```bash
pnpm --filter inbox-zero-ai eval-report        # writes eval-results/eval-dashboard.html
pnpm --filter inbox-zero-ai eval-report --open # also opens it in the browser
```

Options: `--history-dir <dir>` (defaults to `.context/eval-results` or `EVAL_HISTORY_DIR`), `--out <file>`. The page works offline as a plain local file; regenerate it after new eval runs.

The dashboard defaults to the **most recent git commit** in history (not a mixed cross-commit view). Use the commit dropdown to compare older runs or switch to "All commits (mixed)" when you want latest-wins across every recorded run. Each commit-scoped view only includes history files recorded on that commit, so stale pre-fix results do not leak into the current leaderboard.

The **Cost routing** panel compares cheaper models against a quality baseline (defaults to the leaderboard leader). Suites where a cheaper model has the same pass count are highlighted in the matrix (◆). Use this for multi-model routing when optimizing for credits — not for comparing stale commits.

## Result History and Cache

Eval runs with `RUN_AI_TESTS=true` write JSON history to `.context/eval-results/<eval-name>/` by default. Set `EVAL_HISTORY_DIR=off` to disable this, or set `EVAL_HISTORY_DIR=path/to/dir` to choose a different location.

Use `evalReporter.recordCached()` for eval cases where an unchanged scenario/model pair can reuse the previous result instead of calling the model and judge again:

```typescript
const record = await evalReporter.recordCached(
  {
    testName: "case",
    model: model.label,
    cacheKeyParts: [{ model, scenario }],
  },
  async () => {
    const result = await yourFunction({ emailAccount, scenario });
    const pass = result === expected;

    return {
      testName: "case",
      model: model.label,
      pass,
      expected,
      actual: String(result),
    };
  },
);

expect(record.pass).toBe(true);
```

Cache modes:

- `EVAL_RESULT_CACHE=readwrite` — read cached records when present, run and write misses
- `EVAL_RESULT_CACHE=readonly` — require cached records and fail on misses
- `EVAL_RESULT_CACHE=refresh` — ignore cached records, run live, and overwrite
- unset / other values — no result cache

Cache records are stored in `.context/eval-result-cache/` by default. The cache key includes the eval name, test name, reported model, `cacheKeyParts`, and a conservative git fingerprint, so prompt/code changes miss the cache.

## Eval Utilities

- `describeEvalMatrix(name, fn)` — runs tests across all models in `EVAL_MODELS`
- `createEvalReporter()` — creates a reporter instance for recording pass/fail
- `evalReporter.record(result)` — records pass/fail for the comparison report
- `evalReporter.recordCached(options, fn)` — records a cached eval result when available, otherwise runs `fn`
- `evalReporter.printReport()` — outputs console report + optionally writes files
- `judgeBinary({ input, output, criterion })` — binary LLM-as-judge evaluation
- `judgeMultiple({ input, output, criteria })` — evaluates multiple criteria
- `CRITERIA.*` — preset criteria: ACCURACY, COMPLETENESS, TONE, CONCISENESS, NO_HALLUCINATION, CORRECT_FORMAT

## Environment Variables

- `EVAL_MODELS` — not set: single run with env model; `all`: all models; comma-separated: specific models
- `EVAL_REPORT_PATH` — save markdown + JSON report to file
- `EVAL_HISTORY_DIR` — save per-run JSON history; defaults to `.context/eval-results` for AI evals; set `off` to disable
- `EVAL_RESULT_CACHE` — opt into scenario-level result caching: `readwrite`, `readonly`, or `refresh`
- `EVAL_RESULT_CACHE_DIR` — cache directory; defaults to `.context/eval-result-cache`

## Anti-overfitting

- Treat evals as an external spec for behavior, not as wording to copy into prompts
- When an eval fails, fix the general failure mode rather than matching the exact fixture language
- Avoid adding prompt examples that are near-clones of the eval case
- Prefer broader follow-up coverage or neighboring cases over test-specific prompt tuning
