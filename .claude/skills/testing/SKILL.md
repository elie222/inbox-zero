---
name: testing
description: Guidelines for testing the application with Vitest
---
# Testing

All testing guidance lives in this directory. Read the relevant file for your task:

| Type | File | When to use |
|------|------|-------------|
| Unit tests | [unit.md](unit.md) | Framework setup, mocks, colocated tests |
| Writing tests | [write-tests.md](write-tests.md) | What to test, what to skip, workflow |
| LLM tests | [llm.md](llm.md) | Tests that call real LLMs (`pnpm test-ai`) |
| Eval suite | [eval.md](eval.md) | Cross-model comparison, LLM-as-judge |
| E2E tests | [e2e.md](e2e.md) | Real email workflow tests from inbox-zero-e2e repo |

## Quick Commands

```bash
pnpm test -- path/to/file.test.ts   # Single unit test
pnpm test --run                      # All unit tests
pnpm test-ai your-feature            # AI test (real LLM)
EVAL_MODELS=all pnpm test-ai eval/your-feature  # Eval across models
```
