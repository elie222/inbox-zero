---
name: llm-test
description: Guidelines for writing tests for LLM-related functionality
---
Read and follow `.claude/skills/testing/llm.md`.

For normal LLM tests, do not pin fixture users to a specific `aiProvider` / `aiModel`; leave them `null` unless the test is explicitly about model-selection behavior.
