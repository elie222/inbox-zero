# LLM Model Selection Guide

## The Key Insight: Frequency x Cost

**Rare operations should use quality models.** A $15/M token model processing 10 rule creations/month costs ~$0.15. The cost is negligible, so optimize for quality.

**High-volume operations need cost optimization.** The same model processing 10,000 emails/month costs $150+. Use economy tier.

## Model Tiers

| Tier | Maps To | Purpose |
|------|---------|---------|
| **reasoning** | DEFAULT_LLM_* | Best quality, deep understanding |
| **fast** | CHAT_LLM_* | Speed/latency optimized for interactive UX |
| **economy** | ECONOMY_LLM_* | Cost/bulk optimized for high volume |

## Recommended Models (January 2026)

### Anthropic
| Tier | Model | Pricing ($/M tokens) |
|------|-------|----------------------|
| **reasoning** | claude-sonnet-4-5-20250929 | $3 in / $15 out |
| **fast** | claude-haiku-3-5-20241022 | $0.80 in / $4 out |
| **economy** | claude-haiku-3-5-20241022 | $0.80 in / $4 out |

### OpenAI
| Tier | Model | Pricing ($/M tokens) |
|------|-------|----------------------|
| **reasoning** | gpt-5 | $2 in / $8 out |
| **fast** | gpt-5-mini | $0.30 in / $1.20 out |
| **economy** | gpt-5-mini | $0.30 in / $1.20 out |

**Note:** OpenAI's gpt-5-mini offers strong performance at competitive pricing for economy tier.

## Tier Selection Guidelines

### Use `reasoning` when:
- Result is **user-visible** (drafts, reports, recommendations)
- Result is **persisted** (rules, groups, labels, settings)
- Operation is **rarely called** (per-action, one-time setup)
- **Accuracy is critical** (scheduling, important decisions)

### Use `fast` when:
- User is **actively waiting** (interactive chat, live UI)
- **Latency matters more than quality** (autocomplete, typing indicators)
- Result is **ephemeral** (not persisted, immediate feedback)

### Use `economy` when:
- **Large context** processing (knowledge extraction, bulk analysis)
- **Background tasks** (async processing, batch jobs)
- **Simple classification** (binary yes/no with low consequence)
- **Bulk summarization** (digest summaries, report data)

## Quick Decision Tree

```
Is it choosing which rule to apply or drafting a reply?
  → reasoning (accuracy critical - wrong rule = wrong automation)

Is result persisted or user-visible?
  → reasoning (quality matters, cost is negligible)

Is user actively waiting for quick feedback?
  → fast (latency matters)

Is it background/async with large context?
  → economy (optimized for bulk)

Is it simple classification with low consequence?
  → economy (errors are recoverable)
```

**Note:** Per-email operations vary by consequence. Rule matching and reply drafts need reasoning tier despite volume because errors directly affect user trust.

## Adding New Operations

1. Add entry to `operations.ts`:
```typescript
"your.operation-id": {
  description: "What this operation does",
  frequency: "per-email" | "per-batch" | "per-action" | "one-time",
  defaultTier: "reasoning" | "fast" | "economy",
  rationale: "WHY this tier (required!)",
},
```

2. Use in code:
```typescript
import { getModelForOperation } from "@/utils/llms/resolve-model";
const model = getModelForOperation(user, "your.operation-id");
```

3. Default to reasoning for new per-action operations unless there's a specific reason not to.

## Operator Overrides

Override specific operations via environment variable:
```bash
LLM_OPERATION_OVERRIDES='{"rule.match-email":"reasoning"}'
```

This allows operators to upgrade specific operations to higher quality models without code changes.
