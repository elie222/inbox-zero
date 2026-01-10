#!/bin/bash
# Fetch PR code review comments (review comments made on specific lines of code)
# Usage: .claude/scripts/get-pr-review-comments.sh [pr_number] [limit]
#
# If pr_number is omitted, auto-detects from current branch's PR
#
# Example: .claude/scripts/get-pr-review-comments.sh
# Example: .claude/scripts/get-pr-review-comments.sh 1239
# Example: .claude/scripts/get-pr-review-comments.sh 1239 50

set -e

PR_NUM="${1:-$(gh pr view --json number -q .number)}"
LIMIT="${2:-100}"
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

echo "=== Code review comments for $REPO PR #$PR_NUM ==="
gh api "repos/$REPO/pulls/$PR_NUM/comments?per_page=$LIMIT" \
  --jq '.[] | {id, body, author: .user.login, path, line, in_reply_to_id}' \
  | head -n "$LIMIT"
