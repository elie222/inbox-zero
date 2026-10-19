#!/usr/bin/env bash
R="$HOME/Code Workspaces/Inbox Zero/evals/run-eval.sh"
"$R" lms lmstudio-community/gemma-4-12B-it-MLX-4bit
LABEL_SUFFIX=__run2 "$R" lms lmstudio-community/gemma-4-12B-it-MLX-4bit
echo "=== G12 DONE"
