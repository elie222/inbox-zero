#!/bin/bash
# Syncs Cursor rules to Codex prompts via symlinks
# Run this when you add new .mdc files to .cursor/rules/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CURSOR_RULES="$PROJECT_ROOT/.cursor/rules"
CODEX_PROMPTS="$HOME/.codex/prompts"

# Create directories
mkdir -p "$CODEX_PROMPTS/features"
mkdir -p "$CODEX_PROMPTS/wireframes/assistant"

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

# Symlink wireframes/**/*.md files
while IFS= read -r file; do
  relpath=${file#$CURSOR_RULES/}
  target_dir=$(dirname "$CODEX_PROMPTS/$relpath")
  mkdir -p "$target_dir"
  ln -sf "$file" "$CODEX_PROMPTS/$relpath"
  ((count++))
done < <(find "$CURSOR_RULES/wireframes" -name "*.md" -type f 2>/dev/null)

echo "Synced $count Cursor rules to ~/.codex/prompts/"
echo "Restart Codex to pick up changes."
