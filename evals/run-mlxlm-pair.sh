#!/usr/bin/env bash
# Granite and GLM fail on LM Studio (its chat template rejects the app's tool schemas), so they also run on plain mlx_lm.
R="$HOME/Code Workspaces/Inbox Zero/evals/run-eval.sh"
"$R" mlx lmstudio-community/granite-4.2-3b-MLX-4bit
"$R" mlx mlx-community/GLM-4.7-Flash-4bit
echo "=== PAIR DONE"
