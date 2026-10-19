#!/usr/bin/env bash
# The 9-model chain, one at a time. MLX models go through LM Studio's MLX engine (enforces the JSON schema).
R="$HOME/Code Workspaces/Inbox Zero/evals/run-eval.sh"
run(){ echo "=== $(date +%T) START $*"; "$R" "$@"; echo "=== $(date +%T) EXIT $? $*"; }
run lms mlx-community/Qwen3.5-4B-MLX-4bit
run lms lmstudio-community/granite-4.2-3b-MLX-4bit
run lms mlx-community/gemma-4-e4b-it-4bit
run lms mlx-community/Qwen3.5-9B-MLX-4bit
run ollama gemma4:12b-it-qat
run lms mlx-community/gemma-4-26B-A4B-it-qat-4bit
run llama "$HOME/.cache/huggingface/hub/models--Terathox-Coder--Qwen3.8-27B-MTP-GGUF/snapshots/7f412152f5540c3ec34de603e762a36a1ca3fe69/Qwen3.8-27B-Q4_K_M-MTP.gguf"
run lms mlx-community/Qwen3.6-35B-A3B-4bit
run lms mlx-community/GLM-4.7-Flash-4bit
echo "=== ALL DONE $(date +%T)"
