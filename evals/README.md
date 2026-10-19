# Inbox Zero local-model evals

**Solves:** picking a local model for each of Inbox Zero's three AI slots by measurement, so the app runs well on the smallest model that passes, instead of a large model loaded just in case.

Engines: `ollama`, `lms` (LM Studio's MLX engine; enforces the JSON schema, use this for MLX models), `mlx` (plain mlx_lm, ignores the schema), `llama`. Tests run from a scratch copy with the 15 s limits raised to 180 s. Full chain: `run-all.sh`.

Not part of the fork (kept out of git on purpose). Runner: `run-eval.sh <engine> <model> [tests…]`.
Results land in `results/` (one `.json` + `.log` per run, one line per run in `summary.tsv`).

## Slots (from `apps/web/utils/llms/use-cases.ts`)

| Slot | What uses it | Candidates (size) |
|---|---|---|
| economy | bulk sender sorting, digest summaries, chat memory | Qwen3.5-4B MLX (3.1 GB), granite-4.2-3b MLX (2.1), gemma-4-e4b MLX (5.2) |
| default | choosing a rule per email, sender sorting, draft replies, prompt→rules | Qwen3.5-9B MLX (6.0), gemma4:12b-it-qat Ollama (7.2), gemma-4-26B-A4B MLX (15.6, MoE) |
| chat | the assistant chat (tool calls) | Qwen3.8-27B MTP llama.cpp (16.8, same file opencode uses), Qwen3.6-35B-A3B MLX (20.4, MoE), GLM-4.7-Flash MLX (16.9) |

## Examples

```
./run-eval.sh lms mlx-community/Qwen3.5-9B-MLX-4bit
./run-eval.sh ollama gemma4:12b-it-qat
./run-eval.sh llama ~/.cache/huggingface/hub/models--Terathox-Coder--Qwen3.8-27B-MTP-GGUF/snapshots/7f412152f5540c3ec34de603e762a36a1ca3fe69/Qwen3.8-27B-Q4_K_M-MTP.gguf
```

## Rules it keeps
- llama.cpp refuses while a coding session is running (aicode, opencode :8081, aider :8080).
- Refuses to load anything when swap is over 6 GB.
- Never downloads; never reuses a server it did not start; stops its engine on exit.
- Tests read `apps/web/.env.test` only (none exists), never your real `.env`.

## Not covered yet
- `__tests__/eval/*` judged suites (draft quality, assistant chat) need a judge model; upstream defaults to OpenRouter. Set `EVAL_JUDGE_PROVIDER` / `EVAL_JUDGE_MODEL` to a local model before running those.
