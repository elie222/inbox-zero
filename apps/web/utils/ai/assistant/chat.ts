import type { ModelMessage } from "ai";
import type { Logger } from "@/utils/logger";
import type { MessageContext } from "@/app/api/chat/validation";
import { stringifyEmail } from "@/utils/stringify-email";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { ParsedMessage } from "@/utils/types";
import { env } from "@/env";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { toolCallAgentStream } from "@/utils/llms";
import { isConversationStatusType } from "@/utils/reply-tracker/conversation-status-config";
import prisma from "@/utils/prisma";
import type { SystemType } from "@/generated/prisma/enums";
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
  readEmailTool,
  searchInboxTool,
  sendEmailTool,
  updateInboxFeaturesTool,
} from "./chat-inbox-tools";
import { saveMemoryTool, searchMemoriesTool } from "./chat-memory-tools";
import { createEmailProvider } from "@/utils/email/provider";

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
  ReadEmailTool,
  SearchInboxTool,
  SendEmailTool,
  UpdateInboxFeaturesTool,
} from "./chat-inbox-tools";
export type { SaveMemoryTool, SearchMemoriesTool } from "./chat-memory-tools";

export async function aiProcessAssistantChat({
  messages,
  emailAccountId,
  user,
  context,
  chatId,
  memories,
  logger,
}: {
  messages: ModelMessage[];
  emailAccountId: string;
  user: EmailAccountWithAI;
  context?: MessageContext;
  chatId?: string;
  memories?: { content: string; date: string }[];
  logger: Logger;
}) {
  let ruleReadState: RuleReadState | null = null;

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
- For retroactive cleanup requests (for example "clean up my inbox"), first search the inbox to understand what the user is seeing (volume, types of emails, read/unread ratio). Then suggest cleanup options grouped by sender.
- Consider read vs unread status. If most inbox emails are read, the user may be comfortable with their inbox — focus on unread clutter or ask what they want to clean.
- When you need the full content of an email (not just the snippet), use readEmail with the messageId from searchInbox results. Do not re-search trying to find more content.
- If the user asks for an inbox update, search recent messages first and prioritize "To Reply" items.
- Only send emails when the user clearly asks to send now.

Tool call policy:
- When a request can be completed with available tools, call the tool instead of only describing what you would do.
- If a write action needs IDs and the user did not provide them, call searchInbox first to fetch the right IDs.
- Never invent thread IDs, label IDs, sender addresses, or existing rule names.
- "archive_threads" archives specific threads by ID. Use it when the user refers to specific emails shown in results.
- "bulk_archive_senders" archives ALL emails from given senders server-side, not just the visible ones. Use it when the user asks to clean up by sender. Since it affects emails beyond what's shown, confirm the scope with the user before executing.
- Choose the tool that matches what the user actually asked for. Do not default to bulk archive when the user is referring to specific emails.
- For new rules, generate concise names. For edits or removals, fetch existing rules first and use exact names.
- For ambiguous destructive requests (for example archive vs mark read), ask a brief clarification question before writing.
- Before changing an existing rule, call getUserRulesAndSettings immediately before the write.
- If a rule has changed since that read, call getUserRulesAndSettings again and then apply the update.

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
- For low-priority repeated senders, you may suggest bulk archive by sender as an option, but default to archiving the specific threads shown.

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

Conversation memory:
- You can search memories from previous conversations using the searchMemories tool when you need context from past interactions.
- Use this when the user references something discussed before or when past context would help.
- You can save memories using the saveMemory tool when the user asks you to remember something or when you identify a durable preference worth retaining across conversations.
- Do not claim you will "remember" something without actually calling saveMemory.
- Keep memories concise and self-contained.
- IMPORTANT: Memories are only used in chat conversations. They do NOT affect how incoming emails are processed. If the user wants to influence how future emails are handled (e.g., "emails from X are urgent", "never archive emails from my boss"), use updateAbout with mode "append" to add to their personal instructions, or create/update a rule. Use saveMemory only for chat preferences (e.g., "don't use bulk archive", "always show me emails before archiving").

Behavior anchors (minimal examples):
- For "Give me an update on what came in today", call searchInbox first with today's start in the user's timezone, then summarize into must-handle, can-wait, and can-archive.
- For "Turn off meeting briefs and enable auto-file attachments", call updateInboxFeatures with meetingBriefsEnabled=false and filingEnabled=true.
- For "If I'm CC'd on an email it shouldn't be marked To Reply", update the "To Reply" rule instructions with updateRuleConditions.
- For "Archive emails older than 30 days", this is not possible as an automated rule, but you can do it as a one-time action: use searchInbox with a before: date filter, then archive the results with archive_threads.
- For "what does that email say?" or "tell me about this email", use readEmail with the messageId from a prior searchInbox result to get the full body.
- For "clean up my inbox" or retroactive bulk cleanup:
  1. Check the inbox stats in your context to understand the scale and read/unread ratio.
  2. Search inbox with limit 50 to sample messages. For Google accounts, use category filters (category:promotions, category:updates, category:social). For Microsoft accounts, use keyword queries (e.g. "newsletter", "promotion", "unsubscribe").
  3. Group the results for the user and present clear options.
  4. If the user confirms archiving the specific listed emails (e.g., "archive those", "archive the ones you listed"), use "archive_threads" with the thread IDs from the search results.
  5. If the user explicitly asks for sender-level cleanup (e.g., "archive everything from those senders"), use "bulk_archive_senders". Warn the user that this will archive ALL emails from those senders, not just the ones shown.
  6. For ongoing batch cleanup with bulk_archive_senders, search again to find the next batch. Once the user has confirmed a category, continue processing subsequent batches without re-asking.`;

  const toolOptions = {
    email: user.email,
    emailAccountId,
    provider: user.account.provider,
    logger,
    setRuleReadState: (state: RuleReadState) => {
      ruleReadState = state;
    },
    getRuleReadState: () => ruleReadState,
  };

  const hasConversationStatusInResults =
    context?.type === "fix-rule"
      ? context.results.some((result) =>
          isConversationStatusType(result.systemType),
        )
      : false;

  const expectedFixSystemType =
    context && context.type === "fix-rule" && !hasConversationStatusInResults
      ? await getExpectedFixContextSystemTypeSafe({
          context,
          emailAccountId,
          logger,
        })
      : null;

  let inboxStats: { total: number; unread: number } | null = null;
  try {
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider: user.account.provider,
      logger,
    });
    const statsPromise = emailProvider.getInboxStats().catch((err) => {
      logger.warn("getInboxStats failed", { error: err });
      return null;
    });
    inboxStats = await Promise.race([
      statsPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
  } catch (error) {
    logger.warn("Failed to fetch inbox stats for chat context", { error });
  }

  const inboxContextMessage = inboxStats
    ? [
        {
          role: "system" as const,
          content: `Current inbox: ${inboxStats.total} emails total, ${inboxStats.unread} unread.`,
        },
      ]
    : [];

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
              (isConversationStatusFixContext(context, expectedFixSystemType)
                ? "\n\nThis fix is about conversation status classification. Prefer updating conversation rule instructions with updateRuleConditions (for example, To Reply/FYI rules)."
                : ""),
          },
        ]
      : [];

  const cacheControl = {
    providerOptions: {
      anthropic: { cacheControl: { type: "ephemeral" as const } },
    },
  };

  const result = toolCallAgentStream({
    userAi: user.user,
    userEmail: user.email,
    modelType: "chat",
    usageLabel: "assistant-chat",
    messages: [
      {
        role: "system",
        content: system,
        ...cacheControl,
      },
      ...inboxContextMessage,
      ...(memories && memories.length > 0
        ? [
            {
              role: "system" as const,
              content: `Memories from previous conversations:\n${memories.map((m) => `- [${m.date}] ${m.content}`).join("\n")}`,
            },
          ]
        : []),
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
      readEmail: readEmailTool(toolOptions),
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
      searchMemories: searchMemoriesTool(toolOptions),
      saveMemory: saveMemoryTool({ ...toolOptions, chatId }),
      ...(env.NEXT_PUBLIC_EMAIL_SEND_ENABLED
        ? { sendEmail: sendEmailTool(toolOptions) }
        : {}),
    },
  });

  return result;
}

function isConversationStatusFixContext(
  context: MessageContext,
  expectedSystemType: SystemType | null,
) {
  return (
    context.results.some((result) =>
      isConversationStatusType(result.systemType),
    ) || isConversationStatusType(expectedSystemType)
  );
}

async function getExpectedFixContextSystemTypeSafe({
  context,
  emailAccountId,
  logger,
}: {
  context: MessageContext;
  emailAccountId: string;
  logger: Logger;
}): Promise<SystemType | null> {
  try {
    return await getExpectedFixContextSystemType({
      context,
      emailAccountId,
    });
  } catch (error) {
    logger.warn("Failed to resolve expected fix context system type", {
      error,
    });
    return null;
  }
}

async function getExpectedFixContextSystemType({
  context,
  emailAccountId,
}: {
  context: MessageContext;
  emailAccountId: string;
}): Promise<SystemType | null> {
  if (context.expected === "new" || context.expected === "none") return null;

  if ("id" in context.expected) {
    const expectedRule = await prisma.rule.findUnique({
      where: { id: context.expected.id },
      select: { systemType: true, emailAccountId: true },
    });

    if (!expectedRule || expectedRule.emailAccountId !== emailAccountId) {
      return null;
    }

    return expectedRule.systemType ?? null;
  }

  const expectedRule = await prisma.rule.findUnique({
    where: {
      name_emailAccountId: {
        name: context.expected.name,
        emailAccountId,
      },
    },
    select: { systemType: true },
  });

  return expectedRule?.systemType ?? null;
}
