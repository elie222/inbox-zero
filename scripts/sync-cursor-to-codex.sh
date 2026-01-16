#!/bin/bash
# Syncs Cursor rules to Codex prompts via symlinks
# Run this when you add new .mdc files to .cursor/rules/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CURSOR_RULES="$PROJECT_ROOT/.cursor/rules"
CODEX_PROMPTS="$HOME/.codex/prompts"

# Create directories
mkdir -p "$CODEX_PROMPTS/features"

count=0

# Symlink root .mdc files as .md
for file in "$CURSOR_RULES"/*.mdc; do
  [ -f "$file" ] || continue
  basename=$(basename "$file" .mdc)
  ln -sf "$file" "$CODEX_PROMPTS/${basename}.md"
  ((count++))
done

# Symlink features/*.mdc files
for file in "$CURSOR_RULES"/features/*.mdc; do
  [ -f "$file" ] || continue
  basename=$(basename "$file" .mdc)
  ln -sf "$file" "$CODEX_PROMPTS/features/${basename}.md"
  ((count++))
done

echo "Synced $count Cursor rules to ~/.codex/prompts/"
echo "Restart Codex to pick up changes."
