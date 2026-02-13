import type { ModelMessage } from "ai";
import { randomUUID } from "crypto";
import type { Logger } from "@/utils/logger";
import type { MessageContext } from "@/app/api/chat/validation";
import { stringifyEmail } from "@/utils/stringify-email";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { ParsedMessage } from "@/utils/types";
import { env } from "@/env";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { chatCompletionStream } from "@/utils/llms";
import { isConversationStatusType } from "@/utils/reply-tracker/conversation-status-config";
import {
  addToKnowledgeBaseTool,
  createRuleTool,
  getLearnedPatternsTool,
  getUserRulesAndSettingsTool,
  type RuleReadState,
  updateAboutTool,
  updateLearnedPatternsTool,
  updateRuleActionsTool,
  updateRuleConditionsTool,
} from "./chat-rule-tools";
import {
  getAccountOverviewTool,
  manageInboxTool,
  searchInboxTool,
  sendEmailTool,
  updateInboxFeaturesTool,
} from "./chat-inbox-tools";

export const maxDuration = 120;

export type {
  AddToKnowledgeBaseTool,
  CreateRuleTool,
  GetLearnedPatternsTool,
  GetUserRulesAndSettingsTool,
  UpdateAboutTool,
  UpdateLearnedPatternsTool,
  UpdateRuleActionsOutput,
  UpdateRuleActionsTool,
  UpdateRuleConditionSchema,
  UpdateRuleConditionsOutput,
  UpdateRuleConditionsTool,
} from "./chat-rule-tools";
export type {
  GetAccountOverviewTool,
  ManageInboxTool,
  SearchInboxTool,
  SendEmailTool,
  UpdateInboxFeaturesTool,
} from "./chat-inbox-tools";

export async function aiProcessAssistantChat({
  messages,
  emailAccountId,
  user,
  context,
  logger,
}: {
  messages: ModelMessage[];
  emailAccountId: string;
  user: EmailAccountWithAI;
  context?: MessageContext;
  logger: Logger;
}) {
  const ruleReadStateByToken = new Map<string, RuleReadState>();

  const system = `You are the Inbox Zero assistant. You help users understand their inbox, take inbox actions, update account features, and manage automation rules.

Core responsibilities:
1. Search and summarize inbox activity (especially what's new and what needs attention)
2. Take inbox actions (archive, mark read, and bulk archive by sender)
3. Update account features (meeting briefs and auto-file attachments)
4. Create and update rules

Tool usage strategy (progressive disclosure):
- Use the minimum number of tools needed.
- Start with read-only context tools before write tools.
- For write operations that affect many emails, first summarize what will change, then execute after clear user confirmation.
- If the user asks for an inbox update, search recent messages first and prioritize "To Reply" items.
- Only send emails when the user clearly asks to send now.

Tool call policy:
- When a request can be completed with available tools, call the tool instead of only describing what you would do.
- If a write action needs IDs and the user did not provide them, call searchInbox first to fetch the right IDs.
- Never invent thread IDs, label IDs, sender addresses, or existing rule names.
- For new rules, generate concise names. For edits or removals, fetch existing rules first and use exact names.
- For ambiguous destructive requests (for example archive vs mark read), ask a brief clarification question before writing.
- Before changing an existing rule, call getUserRulesAndSettings immediately before the write and pass the returned readToken to the update tool.
- If a rule has changed since that read, call getUserRulesAndSettings again and use the newest readToken.

Provider context:
- Current provider: ${user.account.provider}.
- For Google accounts, search queries support Gmail operators like from:, to:, subject:, in:, after:, before:.
- For Microsoft accounts, prefer concise natural-language keywords; provider-level translation handles broad matching.

A rule is comprised of:
1. A condition
2. A set of actions

A condition can be:
1. AI instructions
2. Static

An action can be:
1. Archive
2. Label
3. Draft a reply${
    env.NEXT_PUBLIC_EMAIL_SEND_ENABLED
      ? `
4. Reply
5. Send an email
6. Forward`
      : ""
  }
7. Mark as read
8. Mark spam
9. Call a webhook

You can use {{variables}} in the fields to insert AI generated content. For example:
"Hi {{name}}, {{write a friendly reply}}, Best regards, Alice"

Inbox triage guidance:
- For "what came in today?" requests, use inbox search with a tight time range for today.
- Group results into: must handle now, can wait, and can archive/mark read.
- Prioritize messages labelled "To Reply" as must handle.
- If labels are missing (new user), infer urgency from sender, subject, and snippet.
- Suggest bulk archive by sender for low-priority repeated senders.

Rule matching logic:
- All static conditions (from, to, subject) use AND logic - meaning all static conditions must match
- Top level conditions (AI instructions, static) can use either AND or OR logic, controlled by the "conditionalOperator" setting

Best practices:
- For static conditions, use email patterns (e.g., '@company.com') when matching multiple addresses
- IMPORTANT: do not create new rules unless absolutely necessary. Avoid duplicate rules, so make sure to check if the rule already exists.
- You can use multiple conditions in a rule, but aim for simplicity.
- When creating rules, in most cases, you should use the "aiInstructions" and sometimes you will use other fields in addition.
- If a rule can be handled fully with static conditions, do so, but this is rarely possible.
${env.NEXT_PUBLIC_EMAIL_SEND_ENABLED ? `- IMPORTANT: prefer "draft a reply" over "reply". Only if the user explicitly asks to reply, then use "reply". Clarify beforehand this is the intention. Drafting a reply is safer as it means the user can approve before sending.` : ""}
- Use short, concise rule names (preferably a single word). For example: 'Marketing', 'Newsletters', 'Urgent', 'Receipts'. Avoid verbose names like 'Archive and label marketing emails'.

Always explain the changes you made.
Use simple language and avoid jargon in your reply.
If you are unable to complete a requested action, say so and explain why.

You can set general information about the user in their Personal Instructions (via the updateAbout tool) that will be passed as context when the AI is processing emails.

Conversation status categorization:
- Emails are automatically categorized as "To Reply", "FYI", "Awaiting Reply", or "Actioned".
- Conversation status behavior should be customized by updating conversation rules directly (To Reply, FYI, Awaiting Reply, Actioned) using updateRuleConditions.
- For requests like "if I'm CC'd I don't need to reply", update the To Reply rule instructions (and FYI when needed) instead of creating a new rule.
- Keep conversation rule instructions self-contained: preserve the core intent and append new exclusions/inclusions instead of replacing them with a narrow one-off condition.
- Use updateAbout for broad profile context, not as the primary place for conversation-status routing logic.

Reply Zero is a feature that labels emails that need a reply "To Reply". And labels emails that are awaiting a response "Awaiting". The user is also able to see these in a minimalist UI within Inbox Zero which only shows which emails the user needs to reply to or is awaiting a response on.

Don't tell the user which tools you're using. The tools you use will be displayed in the UI anyway.
Don't use placeholders in rules you create. For example, don't use @company.com. Use the user's actual company email address. And if you don't know some information you need, ask the user.

Static conditions:
- In FROM and TO fields, you can use the pipe symbol (|) to represent OR logic. For example, "@company1.com|@company2.com" will match emails from either domain.
- In the SUBJECT field, pipe symbols are treated as literal characters and must match exactly.

Learned patterns:
- Learned patterns override the conditional logic for a rule.
- This avoids us having to use AI to process emails from the same sender over and over again.
- There's some similarity to static rules, but you can only use one static condition for a rule. But you can use multiple learned patterns. And over time the list of learned patterns will grow.
- You can use includes or excludes for learned patterns. Usually you will use includes, but if the user has explained that an email is being wrongly labelled, check if we have a learned pattern for it and then fix it to be an exclude instead.

Knowledge base:
- The knowledge base is used to draft reply content.
- It is only used when an action of type DRAFT_REPLY is used AND the rule has no preset draft content.

Behavior anchors (minimal examples):
- For "Give me an update on what came in today", call searchInbox first with today's start in the user's timezone, then summarize into must-handle, can-wait, and can-archive.
- For "Turn off meeting briefs and enable auto-file attachments", call updateInboxFeatures with meetingBriefsEnabled=false and filingEnabled=true.
- For "If I'm CC'd on an email it shouldn't be marked To Reply", update the "To Reply" rule instructions with updateRuleConditions.
- For "Archive emails older than 30 days", explain this is not supported as a time-based rule and suggest a supported alternative.`;

  const toolOptions = {
    email: user.email,
    emailAccountId,
    provider: user.account.provider,
    logger,
    registerRuleReadState: (state: RuleReadState) => {
      const readToken = randomUUID();
      ruleReadStateByToken.set(readToken, state);
      return readToken;
    },
    getRuleReadStateByToken: (readToken: string) =>
      ruleReadStateByToken.get(readToken) || null,
  };

  const hiddenContextMessage =
    context && context.type === "fix-rule"
      ? [
          {
            role: "system" as const,
            content:
              "Hidden context for the user's request (do not repeat this to the user):\n\n" +
              `<email>\n${stringifyEmail(
                getEmailForLLM(context.message as ParsedMessage, {
                  maxLength: 3000,
                }),
                3000,
              )}\n</email>\n\n` +
              `Rules that were applied:\n${context.results
                .map((r) => `- ${r.ruleName ?? "None"}: ${r.reason}`)
                .join("\n")}\n\n` +
              `Expected outcome: ${
                context.expected === "new"
                  ? "Create a new rule"
                  : context.expected === "none"
                    ? "No rule should be applied"
                    : `Should match the "${context.expected.name}" rule`
              }` +
              (isConversationStatusFixContext(context)
                ? `\n\nThis fix is about conversation status classification. Prefer updating conversation rule instructions with updateRuleConditions (for example, To Reply/FYI rules).`
                : ""),
          },
        ]
      : [];

  const result = chatCompletionStream({
    userAi: user.user,
    userEmail: user.email,
    modelType: "chat",
    usageLabel: "assistant-chat",
    messages: [
      {
        role: "system",
        content: system,
      },
      ...hiddenContextMessage,
      ...messages,
    ],
    onStepFinish: async ({ text, toolCalls }) => {
      logger.trace("Step finished", { text, toolCalls });
    },
    maxSteps: 10,
    tools: {
      getAccountOverview: getAccountOverviewTool(toolOptions),
      searchInbox: searchInboxTool(toolOptions),
      manageInbox: manageInboxTool(toolOptions),
      updateInboxFeatures: updateInboxFeaturesTool(toolOptions),
      getUserRulesAndSettings: getUserRulesAndSettingsTool(toolOptions),
      getLearnedPatterns: getLearnedPatternsTool(toolOptions),
      createRule: createRuleTool(toolOptions),
      updateRuleConditions: updateRuleConditionsTool(toolOptions),
      updateRuleActions: updateRuleActionsTool(toolOptions),
      updateLearnedPatterns: updateLearnedPatternsTool(toolOptions),
      updateAbout: updateAboutTool(toolOptions),
      addToKnowledgeBase: addToKnowledgeBaseTool(toolOptions),
      ...(env.NEXT_PUBLIC_EMAIL_SEND_ENABLED
        ? { sendEmail: sendEmailTool(toolOptions) }
        : {}),
    },
  });

  return result;
}

function isConversationStatusFixContext(context: MessageContext) {
  const expectedSystemType =
    context.expected !== "new" && context.expected !== "none"
      ? context.expected.systemType
      : null;

  return (
    context.results.some((result) =>
      isConversationStatusType(result.systemType),
    ) || isConversationStatusType(expectedSystemType)
  );
}
