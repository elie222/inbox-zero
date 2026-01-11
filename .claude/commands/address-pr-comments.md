Resolve all active PR comments (conversation + code review). 
Use GitHub MCP. If not available, use `gh` CLI.

Important: All `gh` CLI commands require `required_permissions: ['all']` due to TLS certificate issues in sandboxed mode.

## Critical Rules

1. **ALWAYS reply to the specific comment** - use replies API, not new PR comment
2. **NEVER post general PR comment** when addressing review comments
3. **WAIT for user** before resolving threads
4. **USE YOUR JUDGMENT** - comments are not guaranteed to be accurate. Evaluate each on its merits before implementing

# Step 1: Fetch comments

```bash
# Get PR number and repo
PR_NUM=$(gh pr view --json number --jq .number)
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)

# Conversation comments (general PR comments)
gh pr view --json comments --jq '.comments[] | {id, body, author: .author.login}'

# Code review comments (inline on specific lines) - usually the main ones
# Script runs: gh api repos/$REPO/pulls/$PR_NUM/comments --jq '.[] | {id, body, author, path, line, in_reply_to_id}'
.claude/scripts/get-pr-review-comments.sh
```

──────────

# Step 2: Create TODO list

Use `todo_write` - one item per comment. Include file:line for code review comments.

──────────

# Step 3: For each comment

1. **Evaluate** - Valid feedback?
   - Improves correctness/quality?
   - Based on accurate understanding?

2. **High confidence (agree)** → Implement fix

3. **Low confidence (disagree/unsure)** → Show comment + reasoning, ask "Address? (y/n)"

4. **Reply to the comment** explaining what was done (or why not)

5. Mark TODO complete, move to next

```bash
# Reply to a review comment (inline code comment)
gh api repos/$REPO/pulls/$PR_NUM/comments/$COMMENT_ID/replies \
  -f body="<your reply>"

# Reply to a conversation comment (general PR comment)
gh pr comment $PR_NUM --body "<reply>" --reply-to $COMMENT_ID
```

──────────

# Step 4: Resolve threads on GitHub

**Ask:** "Resolve addressed comments on GitHub? (all/some/none)"

- **all** → resolve all addressed
- **some** → resolve only high-confidence ones
- **none** → skip

```bash
# Get thread ID from comment ID
OWNER=$(echo $REPO | cut -d/ -f1)
REPO_NAME=$(echo $REPO | cut -d/ -f2)

THREAD_ID=$(gh api graphql -f query='
  query($owner:String!, $repo:String!, $pr:Int!) {
    repository(owner:$owner, name:$repo) {
      pullRequest(number:$pr) {
        reviewThreads(first:100) {
          nodes { id isResolved comments(first:1) { nodes { databaseId } } }
        }
      }
    }
  }' -f owner=$OWNER -f repo=$REPO_NAME -F pr=$PR_NUM \
  --jq ".data.repository.pullRequest.reviewThreads.nodes[] | select(.comments.nodes[0].databaseId == $COMMENT_ID) | .id")

# Resolve thread
gh api graphql -f query='mutation($id:ID!) { resolveReviewThread(input:{threadId:$id}) { thread { isResolved } } }' -f id=$THREAD_ID
```
