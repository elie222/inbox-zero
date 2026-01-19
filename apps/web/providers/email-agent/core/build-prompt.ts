import type { AgentConfigWithDocuments, AgentMemory } from "../types";

/**
 * Build the system prompt for the email agent from user documents
 */
export function buildAgentSystemPrompt(
  config: AgentConfigWithDocuments,
  memories: AgentMemory[] = [],
): string {
  const mainDoc = config.documents.find((d) => d.type === "MAIN");
  const skillDocs = config.documents.filter(
    (d) => d.type === "SKILL" && d.enabled,
  );

  const permittedActions = getPermittedActionsDescription(config);

  const memorySection =
    memories.length > 0
      ? `
## Memories
The following are facts and preferences you have learned:
${memories.map((m) => `- [${m.type}] ${m.key}: ${m.content}`).join("\n")}
`
      : "";

  const skillsSection =
    skillDocs.length > 0
      ? `
## Skills
${skillDocs.map((s) => `### ${s.title}\n${s.content}`).join("\n\n")}
`
      : "";

  return `You are an email assistant that helps manage the user's inbox. You process incoming emails and take actions based on the user's instructions.

## User Instructions
${mainDoc?.content || "No instructions provided. Use your best judgment to categorize and organize emails."}
${skillsSection}
${memorySection}
## Permitted Actions
You are ONLY allowed to perform the following actions:
${permittedActions}

## Important Rules
1. ONLY take actions that are explicitly permitted above
2. If you're unsure what to do with an email, do nothing rather than take a wrong action
3. Be concise in your reasoning
4. When labeling, use existing labels when possible
5. When drafting replies, match the user's writing style if specified
6. Remember important context about senders and patterns for future emails

## Output Format
For each email, analyze it against the user's instructions and take the appropriate action(s).
Explain your reasoning briefly before taking action.`;
}

/**
 * Get a description of permitted actions based on config
 */
function getPermittedActionsDescription(
  config: AgentConfigWithDocuments,
): string {
  const actions: string[] = [];

  if (config.canLabel) {
    actions.push("- **Label email**: Apply labels to categorize emails");
  }
  if (config.canArchive) {
    actions.push(
      "- **Archive email**: Remove email from inbox (move to archive)",
    );
  }
  if (config.canDraftReply) {
    actions.push(
      "- **Draft reply**: Create a draft response (user will review before sending)",
    );
  }
  if (config.canMarkRead) {
    actions.push("- **Mark as read**: Mark the email as read");
  }
  if (config.canWebSearch) {
    actions.push(
      "- **Web search**: Search the web for information about senders or topics",
    );
  }
  if (config.canCreateLabel) {
    actions.push(
      "- **Create/manage labels**: Create new labels or list existing ones",
    );
  }
  if (config.forwardAllowList.length > 0) {
    actions.push(
      `- **Forward email**: Forward to allowed recipients only: ${config.forwardAllowList.join(", ")}`,
    );
  }

  // Memory tools are always available
  actions.push(
    "- **Remember**: Store facts or preferences for future reference",
  );
  actions.push("- **Recall**: Retrieve stored memories");

  if (actions.length === 2) {
    // Only memory tools
    return "No email actions are permitted. You can only observe and remember.";
  }

  return actions.join("\n");
}

/**
 * Build the user message containing the email to process
 */
export function buildEmailUserMessage(email: {
  from: string;
  to: string;
  subject: string;
  content: string;
  date: Date;
  threadId?: string;
  isReply?: boolean;
}): string {
  return `Process this email:

**From:** ${email.from}
**To:** ${email.to}
**Subject:** ${email.subject}
**Date:** ${email.date.toISOString()}
${email.isReply ? "**Note:** This is a reply in an existing thread" : ""}

**Content:**
${email.content}

---
Analyze this email and take appropriate action(s) based on my instructions.`;
}
