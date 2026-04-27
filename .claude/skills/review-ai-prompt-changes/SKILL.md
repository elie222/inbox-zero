---
name: review-ai-prompt-changes
description: Review prompt and tool-description changes in a branch or PR. Use when asked to audit system prompts, prompt builders, tool descriptions, prompt inputs, or nearby evals/tests; summarize what changed; identify guidance that feels eval-shaped or too heavy for product use; and find repeated instructions between the main prompt and tool descriptions.
---

# Review Prompt Changes

Review prompt-related diffs with a product lens. Focus on what actually changed, whether the guidance belongs in the prompt layer where it was added, and whether any wording is repetitive or overfit to evals.

## Scope

- Default to `main...HEAD` unless the user names a different base.
- Prioritize runtime files that shape model behavior:
  - system prompts
  - prompt builders and prompt fragments
  - tool descriptions and schema field descriptions
  - response-formatting instructions
- Read evals and unit tests only after the runtime diffs so you can infer the intent behind the change without letting the tests define the review.

In this repo, likely files live under:

- `apps/web/utils/ai/**`
- `apps/web/utils/ai/assistant/**`
- `apps/web/__tests__/eval/**`
- `apps/web/__tests__/**` for prompt-adjacent unit tests

## Workflow

1. Find the changed files with `git diff --name-only main...HEAD`.
2. Narrow to prompt-relevant files first. Ignore unrelated UI or plumbing unless it changes what reaches the model.
3. Read diffs with enough context to see the full prompt block or tool description.
4. Then read nearby tests or evals to understand what failure mode the change is trying to prevent.
5. Separate your notes into four buckets:
   - behavior changes
   - product-helpful prompt guidance
   - heavy or eval-shaped guidance
   - repeated guidance across layers
6. Prefer exact file and line references in the review.

## What To Look For

### Product-helpful changes

- Capability gating that matches real product states or disabled tools
- Moving provider-specific or tool-specific guidance into the relevant tool description
- Adding richer tool outputs that support grounded answers
- Clear write-confirmation or safety rules tied to real UI behavior

### Heavy or eval-shaped changes

- Cross-cutting language added mainly to defend a known eval failure mode
- Response-policy coaching inside a tool description when it is not tool-local
- Repeated “treat as evidence,” “state the conflict plainly,” or “do not invent causes” language across multiple prompt layers
- Tiny wording splits that duplicate long blocks for web vs messaging, provider A vs provider B, or enabled vs disabled states
- Instructions that read like judging criteria instead of operating guidance

### Repetition to call out

Check whether the same instruction appears in more than one of these places:

- the system prompt
- tool descriptions
- input schema field descriptions
- formatting blocks
- tests or eval-driven comments copied into runtime prompt text

Tool-local guidance usually belongs in the tool description. Cross-cutting behavior rules usually belong in the main prompt. Flag cases where both layers say the same thing without adding meaning.

## Review Output

Use this structure:

1. `Findings`
   - findings first, ordered by severity
   - include file and line references
   - focus on heaviness, redundancy, or misplaced guidance
2. `What Changed`
   - summarize the actual prompt/tool behavior changes
   - mention tests or evals only as evidence of intent
3. `Net Read`
   - say which changes feel product-helpful
   - say which changes feel eval-shaped
   - say what the best trim targets are

Keep the review concise, but cover the full prompt story. The user asked for both the diff summary and the judgment call.

## Repo Notes

- Project-specific skills live under `.claude/skills/<skill-name>/SKILL.md`.
- Match the house style: short frontmatter, concise body, no extra README files.
- Do not edit prompts by default. This skill is for audit/review unless the user explicitly asks for changes.
