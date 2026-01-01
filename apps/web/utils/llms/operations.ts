/**
 * LLM Operation Registry
 *
 * Maps each AI operation to a tier with documented rationale.
 * Tiers use existing env var configuration:
 * - reasoning → DEFAULT_LLM_* (Claude Sonnet)
 * - fast → CHAT_LLM_* (Claude Haiku)
 * - economy → ECONOMY_LLM_* (Claude Haiku)
 *
 * See CLAUDE.md for guidance on adding new operations.
 */

export type ModelTier = "reasoning" | "fast" | "economy";

export interface LLMOperationConfig {
  description: string;
  frequency: "per-email" | "per-batch" | "per-action" | "one-time";
  defaultTier: ModelTier;
  rationale: string;
}

export const LLM_OPERATIONS = {
  // ═══════════════════════════════════════════════════════════════
  // RULE OPERATIONS
  // ═══════════════════════════════════════════════════════════════
  "rule.create-from-prompt": {
    description: "Convert natural language prompt into structured rules",
    frequency: "per-action",
    defaultTier: "reasoning",
    rationale: "Rare user action requiring deep understanding of intent",
  },
  "rule.match-email": {
    description: "Match incoming email against user's rules",
    frequency: "per-email",
    defaultTier: "reasoning",
    rationale:
      "Complex rule matching with negation logic and catch-all fallback. Wrong automation is high-consequence",
  },
  "rule.choose-args": {
    description: "Extract action arguments from matched rule",
    frequency: "per-email",
    defaultTier: "economy",
    rationale: "Per-email structured extraction after rule match",
  },
  "rule.diff": {
    description: "Compare rule differences",
    frequency: "per-action",
    defaultTier: "fast",
    rationale: "Interactive comparison, user waiting",
  },
  "rule.find-existing": {
    description: "Find matching existing rules",
    frequency: "per-action",
    defaultTier: "fast",
    rationale: "Interactive search during rule creation",
  },
  "rule.generate-prompt": {
    description: "Generate AI prompts for rules",
    frequency: "per-action",
    defaultTier: "fast",
    rationale: "Interactive UI operation",
  },
  "rule.detect-recurring-pattern": {
    description: "Detect patterns for automation suggestions",
    frequency: "per-batch",
    defaultTier: "fast",
    rationale: "Background analysis, structured pattern detection",
  },

  // ═══════════════════════════════════════════════════════════════
  // REPLY OPERATIONS
  // ═══════════════════════════════════════════════════════════════
  "reply.draft": {
    description: "Draft email reply using knowledge base",
    frequency: "per-action",
    defaultTier: "reasoning",
    rationale: "User-visible email output. Quality critical",
  },
  "reply.check-needs-reply": {
    description: "Determine if email thread needs a reply",
    frequency: "per-email",
    defaultTier: "economy",
    rationale: "Per-email binary classification",
  },
  "reply.determine-thread-status": {
    description: "Analyze thread for reply status",
    frequency: "per-email",
    defaultTier: "reasoning",
    rationale:
      "Core Reply Zero feature with 9 interdependent rules. Wrong status = missed important replies",
  },
  "reply.collect-context": {
    description: "Collect context for reply drafting",
    frequency: "per-action",
    defaultTier: "economy",
    rationale: "Large context processing before draft",
  },
  "reply.generate-nudge": {
    description: "Generate follow-up nudge emails",
    frequency: "per-action",
    defaultTier: "fast",
    rationale: "Quick structured generation, user waiting",
  },

  // ═══════════════════════════════════════════════════════════════
  // CATEGORIZATION OPERATIONS
  // ═══════════════════════════════════════════════════════════════
  "categorize.sender-bulk": {
    description: "Categorize multiple senders in batch",
    frequency: "per-batch",
    defaultTier: "economy",
    rationale: "Bulk processing, large context",
  },
  "categorize.sender-single": {
    description: "Categorize individual sender",
    frequency: "per-action",
    defaultTier: "economy",
    rationale: "Called per-sender in queue, can be high volume",
  },
  "categorize.cold-email": {
    description: "Detect cold/spam emails",
    frequency: "per-email",
    defaultTier: "economy",
    rationale: "Per-email classification, high volume",
  },

  // ═══════════════════════════════════════════════════════════════
  // KNOWLEDGE OPERATIONS
  // ═══════════════════════════════════════════════════════════════
  "knowledge.extract": {
    description: "Extract knowledge from email content",
    frequency: "per-batch",
    defaultTier: "economy",
    rationale: "Large context processing, background task",
  },
  "knowledge.extract-from-history": {
    description: "Build knowledge from email history",
    frequency: "one-time",
    defaultTier: "economy",
    rationale: "Large context, one-time background processing",
  },
  "knowledge.build-persona": {
    description: "Build user persona from emails",
    frequency: "one-time",
    defaultTier: "economy",
    rationale: "Large context pattern analysis",
  },
  "knowledge.extract-writing-style": {
    description: "Extract writing style patterns",
    frequency: "one-time",
    defaultTier: "economy",
    rationale: "Pattern analysis from examples",
  },

  // ═══════════════════════════════════════════════════════════════
  // CLEAN/ORGANIZE OPERATIONS
  // ═══════════════════════════════════════════════════════════════
  "clean.decide-archive": {
    description: "Decide archive/keep for email",
    frequency: "per-email",
    defaultTier: "reasoning",
    rationale:
      "High-consequence decision with skip rule logic. Wrong archive = data loss. Trust critical",
  },
  "clean.select-labels": {
    description: "Select labels for cleaning operation",
    frequency: "per-action",
    defaultTier: "reasoning",
    rationale:
      "Rare setup action, label selection persisted. Quality over cost",
  },

  // ═══════════════════════════════════════════════════════════════
  // DIGEST/SUMMARY OPERATIONS
  // ═══════════════════════════════════════════════════════════════
  "digest.summarize-email": {
    description: "Summarize email for daily digest",
    frequency: "per-email",
    defaultTier: "economy",
    rationale: "Per-email summarization, high volume",
  },

  // ═══════════════════════════════════════════════════════════════
  // GROUP OPERATIONS
  // ═══════════════════════════════════════════════════════════════
  "group.create": {
    description: "Create email groups",
    frequency: "per-action",
    defaultTier: "reasoning",
    rationale:
      "Rare setup action, group definition persisted. Quality over cost",
  },

  // ═══════════════════════════════════════════════════════════════
  // CALENDAR/MEETING OPERATIONS
  // ═══════════════════════════════════════════════════════════════
  "calendar.parse-availability": {
    description: "Parse calendar availability",
    frequency: "per-action",
    defaultTier: "reasoning",
    rationale: "Scheduling accuracy critical, user-visible",
  },
  "meeting.research-guest": {
    description: "Research meeting participants",
    frequency: "per-action",
    defaultTier: "economy",
    rationale: "Background research with large context",
  },
  "meeting.generate-briefing": {
    description: "Generate meeting briefs",
    frequency: "per-action",
    defaultTier: "reasoning",
    rationale: "User-visible output, quality matters",
  },

  // ═══════════════════════════════════════════════════════════════
  // ASSISTANT/CHAT OPERATIONS
  // ═══════════════════════════════════════════════════════════════
  "assistant.chat": {
    description: "Interactive chat with assistant",
    frequency: "per-action",
    defaultTier: "fast",
    rationale: "Interactive, user waiting, speed critical",
  },
  "assistant.process-request": {
    description: "Process user requests",
    frequency: "per-action",
    defaultTier: "fast",
    rationale: "Interactive UI, speed matters",
  },
  "assistant.find-snippets": {
    description: "Find relevant email snippets",
    frequency: "per-action",
    defaultTier: "economy",
    rationale: "Pattern matching from bulk emails",
  },

  // ═══════════════════════════════════════════════════════════════
  // REPORT OPERATIONS
  // ═══════════════════════════════════════════════════════════════
  "report.analyze-behavior": {
    description: "Analyze email behavior patterns",
    frequency: "one-time",
    defaultTier: "economy",
    rationale: "Large context analysis, background task",
  },
  "report.generate-summary": {
    description: "Generate executive summary",
    frequency: "per-action",
    defaultTier: "reasoning",
    rationale: "User-visible report, quality matters",
  },
  "report.build-persona": {
    description: "Build persona for reports",
    frequency: "one-time",
    defaultTier: "economy",
    rationale: "Pattern analysis from data",
  },
  "report.analyze-response-patterns": {
    description: "Analyze response patterns",
    frequency: "one-time",
    defaultTier: "economy",
    rationale: "Pattern analysis from summaries",
  },
  "report.summarize-emails": {
    description: "Bulk summarize for reports",
    frequency: "per-batch",
    defaultTier: "economy",
    rationale: "Bulk processing, large context",
  },
  "report.analyze-labels": {
    description: "Suggest label optimizations",
    frequency: "one-time",
    defaultTier: "economy",
    rationale: "Background analysis",
  },
  "report.generate-recommendations": {
    description: "Generate actionable recommendations",
    frequency: "per-action",
    defaultTier: "reasoning",
    rationale: "User-visible recommendations, rare action. Quality over cost",
  },

  // ═══════════════════════════════════════════════════════════════
  // MCP OPERATIONS
  // ═══════════════════════════════════════════════════════════════
  "mcp.agent": {
    description: "MCP agent operations",
    frequency: "per-action",
    defaultTier: "economy",
    rationale: "Tool-based operations, structured tasks",
  },
} as const satisfies Record<string, LLMOperationConfig>;

export type LLMOperationId = keyof typeof LLM_OPERATIONS;
