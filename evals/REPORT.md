# Inbox Zero local-model evals: report, fair rerun (2026-10-19)

**Solves:** picking the smallest local model per AI slot that passes upstream's AI tests, so the app stops holding an 18 GB model next to the coding model.

**Headline:** the three plumbing fixes worked. Timeouts are gone (0 for 7 of 9 models), JSON-schema errors are gone (0 on 6 of 9), and scores rose 5 to 20 tests per model. **gemma4:12b (Ollama) is the best model measured, 54/62 at 7.2 GB.** Qwen3.5-4B is the smallest model that holds up (41-44/62 at 3.1 GB). Two models (granite, GLM) still cannot be scored fairly on any MLX engine we have.

Suite: 6 upstream `ai-regression` files, 62 tests, thinking off, one model at a time, one run each. Run-to-run noise is about ±3 tests (Qwen3.5-4B scored 44 in the proving run and 41 in the final one, because of runaway answers, see Remaining plumbing).

**Key:** peak = macOS physical footprint of the engine process (what Activity Monitor calls Memory), measured at 32k context. It includes the model, the KV cache and Metal buffers, so it is larger than the file size. File size is what the model costs at rest.

## Economy slot (bulk sender sorting, digest summaries, chat memory)

| Test file | Qwen3.5-4B MLX | gemma-4-e4b MLX | granite-4.2-3b MLX |
|---|---|---|---|
| ai-choose-rule | 12/16 | **13/16** | 13/16 (mlx_lm only) |
| determine-thread-status | 14/20 | **17/20** | 9/20 |
| ai-categorize-senders | 2/6 | **3/6** | 1/6 |
| ai-summarize-email-for-digest | 9/11 | **10/11** | 1/11 |
| ai-prompt-to-rules | **2/6** | 0/6 | 0/6 |
| reply/draft-reply | 2/3 | 2/3 | 0/3 |
| **Total** | 41/62 | **45/62** | no fair score (24/62 on mlx_lm) |
| Timeouts / schema errors | 6 / 0 | 0 / 2 | n/a |
| Seconds | 721 | 131 | n/a |
| File / peak | 3.1 / 7.7 GB | 5.2 / 7.5 GB | 2.1 / n/a |

## Default slot (choosing a rule per email, sender sorting, drafts, prompt to rules)

| Test file | Qwen3.5-9B MLX | gemma4:12b-it-qat Ollama | gemma-4-26B-A4B MLX |
|---|---|---|---|
| ai-choose-rule | 13/16 | **14/16** | 13/16 |
| determine-thread-status | 18/20 | **19/20** | 18/20 |
| ai-categorize-senders | 3/6 | 3/6 | 3/6 |
| ai-summarize-email-for-digest | **11/11** | **11/11** | **11/11** |
| ai-prompt-to-rules | 0/6 | **5/6** | 2/6 |
| reply/draft-reply | 2/3 | 2/3 | 2/3 |
| **Total** | 47/62 | **54/62** | 49/62 |
| Timeouts / schema errors | 0 / 0 | 0 / 0 | 0 / 0 |
| Seconds | 160 | 298 | 132 |
| File / peak | 6.0 / 10.0 GB | 7.2 / 11.3 GB | 15.6 / 20.5 GB |

## Chat slot (assistant chat, tool calls)

| Test file | Qwen3.8-27B MTP llama.cpp | Qwen3.6-35B-A3B MLX | GLM-4.7-Flash MLX |
|---|---|---|---|
| ai-choose-rule | 13/16 | **14/16** | 13/16 (mlx_lm only) |
| determine-thread-status | 17/20 | **18/20** | 15/20 |
| ai-categorize-senders | 2/6 | **3/6** | 2/6 |
| ai-summarize-email-for-digest | 8/11 | **11/11** | 1/11 |
| ai-prompt-to-rules | **2/6** | 0/6 | 1/6 |
| reply/draft-reply | 1/3 | **2/3** | 0/3 |
| **Total** | 43/62 | **48/62** | no fair score (32/62 on mlx_lm) |
| Timeouts / schema errors | 6 / 4 | 0 / 8 | n/a |
| Seconds | 638 | 129 | n/a |
| File / peak | 16.8 / 12.3 GB | 20.4 / 23.6 GB | 16.9 / n/a |

None of these 6 files tests chat or tool use end to end. The judged chat suites (`__tests__/eval/*`) still need a judge model and were not run.

## Recommendation per slot

| Slot | Pick | File / peak RAM | Why |
|---|---|---|---|
| economy | **Qwen3.5-4B MLX** | 3.1 / 7.7 GB | Within 4 tests of gemma-4-e4b (41 vs 45) at 2.1 GB less. The two tie on digest summaries and sender sorting, which are the economy jobs. gemma-4-e4b is the safer pick if thread-status quality matters (17 vs 14). |
| default | **gemma4:12b-it-qat (Ollama)** | 7.2 / 11.3 GB | Best score of all nine, and the only one that handles prompt-to-rules (5/6). 4× smaller than gemma-26B, which scores 5 lower. |
| chat | **no pick** | | No test here covers chat. Qwen3.6-35B scores best of the chat candidates (48) but is the largest, and its schema errors (8) matter for tool calls. Keep the current setup until the judged chat suite runs. |
| **Total** | two models | **10.3 GB at rest** (3.1 + 7.2) | vs 18 GB today. **Smallest option:** gemma4:12b alone for both slots is 7.2 GB at rest, 54/62. |

## gemma 12B head to head: Ollama (QAT) vs MLX (added after the main run)

Caleb approved the 6.3 GB download of `lmstudio-community/gemma-4-12B-it-MLX-4bit`. Run twice in LM Studio's MLX engine (thinking off, 32k context, 180 s limit). The two runs matched test for test.

| | Ollama gemma4:12b-it-qat | MLX gemma-4-12B-it 4bit (2 runs) |
|---|---|---|
| ai-choose-rule | 14/16 | 14/16 |
| determine-thread-status | 19/20 | 18/20 |
| ai-categorize-senders | 3/6 | 2/6 |
| ai-summarize-email-for-digest | 11/11 | 9/11 |
| ai-prompt-to-rules | 5/6 | 3/6 |
| reply/draft-reply | 2/3 | 2/3 |
| **Total** | **54/62** | **48/62** |
| Seconds | **298** | 479 / 488 |
| Timeouts / schema errors | 0 / 0 | 4 / 0 |
| File / peak footprint | 7.2 / 11.3 GB | 6.3 / 13.3 and 12.3 GB |

**Reading:** MLX is not faster here and not as good. Four tests hit the 180 s limit in both MLX runs (the same four each time), and three more took 130-140 s. These look like runaway answers under LM Studio's constrained decoding, which Ollama does not show, so the 6-test gap is partly the engine and cannot be cleanly separated from the build. Ollama's build is QAT (trained for 4-bit) and this MLX build is not, so some of the gap may be the weights. Memory is similar (MLX 1-2 GB higher at peak). **The pick does not change:** gemma4:12b on Ollama for the default slot, and it is also the best single model for economy plus default (54/62, 7.2 GB at rest).

## What was fixed since the first pass

| # | Problem | Fix | Proof |
|---|---|---|---|
| 1 | Upstream hard-codes 15 s / 30 s per test | `run-eval.sh` copies the 6 suite files into `apps/web/test-results/scratch-eval/` (gitignored), raises the limit to 180 s, runs there and deletes the copy on exit | Timeouts: 0 on 7 of 9 models. The fork's `git status` is clean. |
| 2 | `mlx_lm server` ignores `response_format: json_schema` | New engine `lms`: LM Studio's MLX engine (already installed) serves the same weights from the Hugging Face cache and enforces the schema. `mk-lms-model.py` links the weights into `~/.lmstudio/models/evals-hf/` and switches the chat template to thinking off | Schema errors: 0 on 6 of 9 (was 45-57 per MLX model). Probe returned valid `{"content": …}` with the answer in `content`, not `reasoning_content`. |
| 3 | Peak memory missed Ollama and undercounted MLX | Sampler now reads `footprint` for the engine's processes (all `ollama` processes, all LM Studio processes, or the server pid) | Ollama row shows 11.3 GB (was 0). MLX rows now exceed file size, as they should. |

## Remaining plumbing

| # | Problem | What it hits | What it means |
|---|---|---|---|
| 1 | **No engine here runs granite or GLM fairly.** LM Studio's chat template rejects the app's tool schemas ("'type' must be a string", 26 Bad Request each), so tool-using tests fail. Plain `mlx_lm` has no schema support. | granite-4.2-3b, GLM-4.7-Flash | Totals above for these two are not scored. Their `mlx_lm` rows (24 and 32) are in `results/` but 146-173 schema failures make them a floor. To score them: serve them through llama.cpp as GGUF (none installed; nothing downloaded). |
| 2 | **Runaway answers.** Some constrained generations loop until the 180 s limit. | Qwen3.5-4B (6 timeouts, 721 s), Qwen3.8-27B (6, 638 s) | Cost Qwen3.5-4B about 3 tests on this run (44 in the proving run). A max-output-token cap in the app would likely fix it. |
| 3 | **The judge is the model under test.** `ai-prompt-to-rules` and similar tests grade with an LLM judge. Without an OpenRouter key the judge falls back to the same local model. | ai-prompt-to-rules column | A weak model grades its own output. Treat that column as soft. Fix needs `EVAL_JUDGE_*` pointed at a fixed model, and the judge code only accepts hosted providers. |
| 4 | **Peak memory is a ceiling, not a typical use.** 32k context and Metal buffers inflate footprint (Qwen3.5-4B shows 7.7 GB for a 3.1 GB file). Plain `mlx_lm` rows read even higher (granite 14 GB). | Peak column | Use file size to compare models; use peak to leave headroom. |
| 5 | A few schema mismatches remain: Qwen3.6-35B 8, Qwen3.8-27B 4, gemma-4-e4b 2. | Those rows | Small, already counted as test failures. |
| 6 | Some tests fail for every model (categorize-senders 1-3/6, draft-reply ≤2/3). | Same tests across all rows | Likely test strictness, not model quality. Doesn't change the ranking. |
| 7 | Redis and Postgres are not configured in tests. | Stderr noise only | None needed. |

## Run notes

- gemma 12B MLX rows come from `run-gemma12-mlx.sh` (second run labelled `__run2`).
- Results: `results/*.json` and `.log`, one line per run in `results/summary.tsv`. The two `mlx__` rows come from `run-mlxlm-pair.sh`, the rest from `run-all.sh`. Older passes are kept in `results/old-pass1/` (first pass), `results/proof/` (Qwen3.5-4B proving run) and `results/aborted/` (a first chain I stopped to add the 32k context setting).
- Engines per row: MLX models run in LM Studio's MLX engine, gemma4:12b in Ollama, Qwen3.8-27B in llama.cpp (no coding session was running).
- Files added in `~/.lmstudio/models/evals-hf/`: symlinks to the Hugging Face cache plus a patched chat-template copy per model. Safe to delete; nothing was downloaded.
- **Incident:** an early version of `mk-lms-model.py` followed a symlink and overwrote the snapshot links of Qwen3.5-4B-MLX-4bit in the Hugging Face cache. The weights were never touched; all 12 links were restored and each file's hash matches its stored blob. The script now refuses to write through a symlink.
- The fork at `inbox-zero/` was not edited: `git status` is clean and the scratch folder is gone. Nothing is committed.
