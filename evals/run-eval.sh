#!/usr/bin/env bash
# Solves: picking a local model for each Inbox Zero AI slot (default / economy / chat) by
# measurement instead of guesswork. Runs upstream's own AI tests against ONE local model
# on ONE engine, records pass/fail, wall time and the engine's peak memory, then stops
# the engine it started.
#
# Usage:
#   run-eval.sh <engine> <model> [test files...]
#     engine  ollama | mlx | lms | llama   (lms = LM Studio's MLX engine, enforces the JSON schema)
#     model   ollama tag (gemma4:e4b) | mlx repo (mlx-community/Qwen3.5-9B-MLX-4bit)
#             | gguf path (~/.cache/huggingface/hub/.../X.gguf)
#   Test files are relative to apps/web; default is the SUITE below.
#
# Rules it keeps (same as local-worker):
#   - llama.cpp never runs while a coding session (aicode / opencode :8081 / aider :8080) is up
#   - refuses to load anything when swap is already over 6 GB
#   - never downloads a model; never reuses a server it did not start
set -uo pipefail

REPO="$HOME/Code Workspaces/Inbox Zero/inbox-zero"
OUT_DIR="$HOME/Code Workspaces/Inbox Zero/evals/results"
NODE24="/opt/homebrew/opt/node@24/bin"
MLX_PY="$HOME/.transcriber/venv/bin/python"
PORT_MLX=8795
PORT_LLAMA=8796
PORT_LMS=8797
HERE="$(cd "$(dirname "$0")" && pwd)"
# Thinking off by default: the app asks for structured JSON, and a thinking model's
# answer otherwise lands in a reasoning field the app never reads. THINK=true to compare.
THINK="${THINK:-false}"
SUITE=(
  __tests__/ai-regression/ai-choose-rule.test.ts
  __tests__/ai-regression/ai-categorize-senders.test.ts
  __tests__/ai-regression/determine-thread-status.test.ts
  __tests__/ai-regression/ai-summarize-email-for-digest.test.ts
  __tests__/ai-regression/ai-prompt-to-rules.test.ts
  __tests__/ai-regression/reply/draft-reply.test.ts
)

engine="${1:?engine: ollama|mlx|lms|llama}"
model="${2:?model}"
shift 2
tests=("$@")
[ ${#tests[@]} -eq 0 ] && tests=("${SUITE[@]}")

swap_gb() { sysctl -n vm.swapusage | sed -E 's/.*used = ([0-9.]+)M.*/\1/' | awk '{printf "%.1f", $1/1024}'; }
port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
coding_session() {
  pgrep -f '\.local/bin/aicode' >/dev/null && { echo "aicode is running"; return 0; }
  port_busy 8081 && { echo "opencode's llama-server is on :8081"; return 0; }
  port_busy 8080 && { echo "aider's mlx server is on :8080"; return 0; }
  return 1
}

if awk "BEGIN{exit !($(swap_gb) > 6)}"; then
  echo "REFUSED: swap is $(swap_gb) GB (over 6). Close something first." >&2; exit 3
fi

pid=""; started_ollama=""
LMS="$HOME/.lmstudio/bin/lms"; lms_loaded=""; lms_started=""
# Scratch copy of the suite with upstream's hard-coded 15 s test limits raised to 180 s.
# Lives in a gitignored folder (apps/web/test-results/) so vitest still resolves the app's imports.
SCRATCH_REL="test-results/scratch-eval"; SCRATCH="$REPO/apps/web/$SCRATCH_REL"
cleanup() {
  [ -d "$SCRATCH" ] && command rm -r -- "$SCRATCH"
  if [ -n "$lms_loaded" ]; then "$LMS" unload "$lms_loaded" >/dev/null 2>&1; fi
  [ -n "$lms_started" ] && "$LMS" server stop >/dev/null 2>&1
  [ -n "${sampler:-}" ] && kill "$sampler" 2>/dev/null
  if [ -n "$pid" ]; then kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null; fi
  if [ "$engine" = ollama ]; then
    curl -s http://127.0.0.1:11434/api/generate -d "{\"model\":\"$model\",\"keep_alive\":0}" >/dev/null 2>&1
    [ -n "$started_ollama" ] && kill "$started_ollama" 2>/dev/null
  fi
}
trap cleanup EXIT INT TERM

case "$engine" in
  ollama)
    if ! curl -sf http://127.0.0.1:11434/api/version >/dev/null; then
      ollama serve >/dev/null 2>&1 & started_ollama=$!
      until curl -sf http://127.0.0.1:11434/api/version >/dev/null; do sleep 1; done
    fi
    ollama list | awk '{print $1}' | grep -qx "$model" || { echo "REFUSED: $model not installed in Ollama" >&2; exit 3; }
    curl -s http://127.0.0.1:11434/api/generate -d "{\"model\":\"$model\",\"keep_alive\":\"10m\"}" >/dev/null
    provider=ollama; model_id="$model"
    export OLLAMA_BASE_URL="http://127.0.0.1:11434"
    ;;
  mlx)
    port_busy $PORT_MLX && { echo "REFUSED: :$PORT_MLX in use" >&2; exit 3; }
    HF_HUB_OFFLINE=1 "$MLX_PY" -m mlx_lm server --model "$model" --host 127.0.0.1 --port $PORT_MLX \
      --max-tokens 8192 --chat-template-args "{\"enable_thinking\":$THINK}" \
      >"$OUT_DIR/.engine.log" 2>&1 & pid=$!
    until curl -sf http://127.0.0.1:$PORT_MLX/v1/models >/dev/null; do
      kill -0 "$pid" 2>/dev/null || { echo "REFUSED: mlx server died; see $OUT_DIR/.engine.log" >&2; exit 3; }
      sleep 1
    done
    provider=openai-compatible; model_id="$model"
    export OPENAI_COMPATIBLE_BASE_URL="http://127.0.0.1:$PORT_MLX/v1"
    ;;
  lms)
    port_busy $PORT_LMS && { echo "REFUSED: :$PORT_LMS in use" >&2; exit 3; }
    name=$(python3 "$HERE/mk-lms-model.py" "$model") || { echo "REFUSED: cannot prepare $model" >&2; exit 3; }
    "$LMS" server start --port $PORT_LMS >/dev/null 2>&1; lms_started=1
    key=$("$LMS" ls --json | python3 -c "import sys,json;print(next((m['modelKey'] for m in json.load(sys.stdin) if m.get('path')=='evals-hf/$name'),''))")
    [ -n "$key" ] || { echo "REFUSED: LM Studio did not index $name" >&2; exit 3; }
    "$LMS" load "$key" --identifier evalm -c 32768 --parallel 1 -y >"$OUT_DIR/.engine.log" 2>&1 || { echo "REFUSED: lms load failed; see $OUT_DIR/.engine.log" >&2; exit 3; }
    lms_loaded=evalm
    provider=openai-compatible; model_id="evalm"
    export OPENAI_COMPATIBLE_BASE_URL="http://127.0.0.1:$PORT_LMS/v1"
    ;;
  llama)
    if why=$(coding_session); then echo "REFUSED: coding comes first ($why)" >&2; exit 3; fi
    [ -f "$model" ] || { echo "REFUSED: no gguf at $model" >&2; exit 3; }
    port_busy $PORT_LLAMA && { echo "REFUSED: :$PORT_LLAMA in use" >&2; exit 3; }
    alias_name=$(basename "$model" .gguf)
    args=(-m "$model" --alias "$alias_name" --host 127.0.0.1 --port $PORT_LLAMA -c 32768 --parallel 1
          --jinja -fa on -ctk q8_0 -ctv q8_0 --offline --no-webui)
    [ "$THINK" = false ] && args+=(--reasoning off --reasoning-budget 0)
    case "$alias_name" in *MTP*|*mtp*) args+=(-ctkd q8_0 -ctvd q8_0 --spec-type draft-mtp --spec-draft-n-max 3);; esac
    llama-server "${args[@]}" >"$OUT_DIR/.engine.log" 2>&1 & pid=$!
    until curl -sf http://127.0.0.1:$PORT_LLAMA/health >/dev/null; do
      kill -0 "$pid" 2>/dev/null || { echo "REFUSED: llama-server died; see $OUT_DIR/.engine.log" >&2; exit 3; }
      sleep 1
    done
    provider=openai-compatible; model_id="$alias_name"
    export OPENAI_COMPATIBLE_BASE_URL="http://127.0.0.1:$PORT_LLAMA/v1"
    ;;
  *) echo "engine must be ollama|mlx|lms|llama" >&2; exit 64 ;;
esac

label="${engine}__$(basename "${model}" .gguf | tr '/:' '__')"
[ "$THINK" = true ] && label="${label}__think"
label="${label}${LABEL_SUFFIX:-}"
mkdir -p "$OUT_DIR"
peak_file="$OUT_DIR/.peak"; echo 0 >"$peak_file"
# Peak memory = macOS physical footprint (what Activity Monitor calls Memory), not RSS:
# RSS undercounts Metal/GPU memory. We take the biggest single process among the engine's own.
mem_mb() {
  local pids best=0 m p
  case "$engine" in
    ollama) pids=$(pgrep -f 'ollama') ;;
    lms)    pids=$(pgrep -f 'LM Studio|\.lmstudio') ;;
    *)      pids="$pid" ;;
  esac
  for p in $pids; do
    m=$(footprint -p "$p" 2>/dev/null | awk '/Footprint:/ && !f {v=$(NF-5); u=$(NF-4); if(u=="KB")v/=1024; else if(u=="GB")v*=1024; printf "%d", v; f=1}')
    [ -n "$m" ] && [ "$m" -gt "$best" ] && best=$m
  done
  echo "$best"
}
( while :; do
    r=$(mem_mb)
    [ "$r" -gt "$(cat "$peak_file")" ] && echo "$r" >"$peak_file"
    sleep 3
  done ) & sampler=$!

export RUN_AI_TESTS=true
export DEFAULT_LLMS="$provider:$model_id"
export EVAL_MODELS="[{\"provider\":\"$provider\",\"model\":\"$model_id\",\"label\":\"$label\"}]"
mkdir -p "$SCRATCH"; scratch_tests=()
for t in "${tests[@]}"; do
  dest="$SCRATCH_REL/${t#__tests__/ai-regression/}"; mkdir -p "$REPO/apps/web/$(dirname "$dest")"
  sed -E 's/(const (TEST_)?TIMEOUT = )15_000/\1180_000/' "$REPO/apps/web/$t" >"$REPO/apps/web/$dest"
  scratch_tests+=("$dest")
done
start=$(date +%s)
( cd "$REPO/apps/web" && PATH="$NODE24:$PATH" npx -y pnpm@11.19.0 exec vitest --run --testTimeout=180000 \
    --reporter=default --reporter=json --outputFile="$OUT_DIR/$label.json" "${scratch_tests[@]}" ) \
  >"$OUT_DIR/$label.log" 2>&1
secs=$(( $(date +%s) - start ))
peak_mb=$(cat "$peak_file")

python3 - "$OUT_DIR/$label.json" "$label" "$secs" "$peak_mb" "$OUT_DIR/summary.tsv" <<'PY'
import json, sys, os
path, label, secs, peak, summary = sys.argv[1:]
try:
    d = json.load(open(path))
    p, f = d.get("numPassedTests", 0), d.get("numFailedTests", 0)
except Exception:
    p = f = -1
new = not os.path.exists(summary)
with open(summary, "a") as fh:
    if new:
        fh.write("label\tpassed\tfailed\tseconds\tpeak_mb\n")
    fh.write(f"{label}\t{p}\t{f}\t{secs}\t{peak}\n")
print(f"{label}: {p} passed, {f} failed, {secs}s, engine peak {peak} MB")
PY
