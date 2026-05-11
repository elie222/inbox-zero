---
name: testing
description: Guidelines for testing the application with Vitest, including unit tests, integration tests (emulator), AI tests, and eval suites for LLM features
---
# Testing

All testing guidance lives in this directory. Read the relevant file for your task:

| Type | File | When to use |
|------|------|-------------|
| Unit tests | [unit.md](unit.md) | Framework setup, mocks, colocated tests |
| Writing tests | [write-tests.md](write-tests.md) | What to test, what to skip, workflow |
| LLM tests | [llm.md](llm.md) | Tests that call real LLMs (`pnpm test-ai`) |
| Eval suite | [eval.md](eval.md) | Cross-model comparison, LLM-as-judge |
| Integration | [integration.md](integration.md) | Emulator-backed tests (`pnpm test-integration`) |
| E2E tests | [e2e.md](e2e.md) | Real email workflow tests from inbox-zero-e2e repo |

Prefer behavior-focused assertions; avoid freezing prompt copy or internal call shapes unless those exact values are the contract under test.

## Quick Commands

```bash
pnpm test path/to/file.test.ts       # Single unit test
pnpm test                            # All unit tests
pnpm test-integration                # Integration tests (emulator)
pnpm test-ai ai-regression/your-feature  # Live AI regression test
EVAL_MODELS=all pnpm test-ai eval/your-feature  # Eval across models
```
