import { tool, type JSONValue, type ModelMessage } from "ai";
import { z } from "zod";
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
  updatePersonalInstructionsTool,
  updateLearnedPatternsTool,
  updateRuleActionsTool,
  updateRuleConditionsTool,
} from "./chat-rule-tools";
import {
  getAssistantCapabilitiesTool,
  updateAssistantSettingsCompatTool,
  updateAssistantSettingsTool,
} from "./chat-settings-tools";
import {
  forwardEmailTool,
  getAccountOverviewTool,
  manageInboxTool,
  readAttachmentTool,
  readEmailTool,
  replyEmailTool,
  searchInboxTool,
  sendEmailTool,
  updateInboxFeaturesTool,
} from "./chat-inbox-tools";
import { createOrGetLabelTool, listLabelsTool } from "./chat-label-tools";
import { saveMemoryTool, searchMemoriesTool } from "./chat-memory-tools";
import { getCalendarEventsTool } from "./chat-calendar-tools";
import type { MessagingPlatform } from "@/utils/messaging/platforms";
import {
  buildFreshRuleContextMessage,
  buildRuleReadState,
  loadCurrentRulesRevision,
  loadAssistantRuleSnapshot,
  type RuleReadState,
} from "./chat-rule-state";

export const maxDuration = 120;

export type {
  AddToKnowledgeBaseTool,
  CreateRuleTool,
  GetLearnedPatternsTool,
  GetUserRulesAndSettingsTool,
  UpdatePersonalInstructionsTool,
  UpdateLearnedPatternsTool,
  UpdateRuleActionsOutput,
  UpdateRuleActionsTool,
  UpdateRuleConditionSchema,
  UpdateRuleConditionsOutput,
  UpdateRuleConditionsTool,
} from "./chat-rule-tools";
export type {
  GetAssistantCapabilitiesTool,
  UpdateAssistantSettingsTool,
} from "./chat-settings-tools";
export type {
  CreateOrGetLabelTool,
  ListLabelsTool,
} from "./chat-label-tools";
export type {
  ForwardEmailTool,
  GetAccountOverviewTool,
  ManageInboxTool,
  ReadAttachmentTool,
  ReadEmailTool,
  ReplyEmailTool,
  SearchInboxTool,
  SendEmailTool,
  UpdateInboxFeaturesTool,
} from "./chat-inbox-tools";
export type { SaveMemoryTool, SearchMemoriesTool } from "./chat-memory-tools";
export type { GetCalendarEventsTool } from "./chat-calendar-tools";

type AssistantChatOnStepFinish = NonNullable<
  Parameters<typeof toolCallAgentStream>[0]["onStepFinish"]
>;

export async function aiProcessAssistantChat({
  messages,
  emailAccountId,
  user,
  context,
  chatId,
  chatLastSeenRulesRevision,
  chatHasHistory,
  memories,
  inboxStats,
  responseSurface = "web",
  messagingPlatform,
  onRulesStateExposed,
  onStepFinish,
  logger,
}: {
  messages: ModelMessage[];
  emailAccountId: string;
  user: EmailAccountWithAI;
  context?: MessageContext;
  chatId?: string;
  chatLastSeenRulesRevision?: number | null;
  chatHasHistory?: boolean;
  memories?: { content: string; date: string }[];
  inboxStats?: { total: number; unread: number } | null;
  responseSurface?: "web" | "messaging";
  messagingPlatform?: MessagingPlatform;
  onRulesStateExposed?: (rulesRevision: number) => void;
  onStepFinish?: AssistantChatOnStepFinish;
  logger: Logger;
}) {
  if (chatLastSeenRulesRevision !== undefined && chatHasHistory === undefined) {
    throw new Error(
      "chatHasHistory must be provided when chatLastSeenRulesRevision is set",
    );
  }

  const emailSendToolsEnabled = env.NEXT_PUBLIC_EMAIL_SEND_ENABLED;
  let ruleReadState: RuleReadState | null = null;

  const system = `You are the Inbox Zero assistant. You help users understand their inbox, take inbox actions, update account features, and manage automation rules.

Core responsibilities:
1. Search and summarize inbox activity (especially what's new and what needs attention)
2. Take inbox actions (archive, trash/delete, mark read, bulk archive by sender, and sender unsubscribe)
3. Update account features (meeting briefs and auto-file attachments)
4. Create and update rules

Tool usage strategy (progressive disclosure):
- Use the minimum number of tools needed.
- Start with read-only context tools before write tools.
- Some tools require activation first. Call activateTools with the needed capability groups before using: calendar ("calendar"), attachment reading ("attachments"), label management ("labels"), account settings ("settings"), conversation memory ("memory"), knowledge base ("knowledge"), or email forwarding ("forward").
- When you know you will need an extended tool (e.g. the user asks to remember something, change settings, or check their calendar), activate the relevant group immediately — do not wait until you try to use the tool and fail.
- For write operations that affect many emails, first summarize what will change, then execute after clear user confirmation.
- When the user asks what settings can or cannot be changed, call getAssistantCapabilities (no activation needed).
- For supported account-setting updates, activate "settings" then prefer updateAssistantSettings.
- Personal Instructions are durable user context that is always available when the AI processes future emails. Use updatePersonalInstructions for broad standing preferences, priorities, and background.
- Append to Personal Instructions by default. Replace only when the user clearly wants to overwrite them.
- For scheduled check-ins and draft knowledge base management, call getAssistantCapabilities when capability or destination context is missing or stale; otherwise reuse recent capability context. Activate "settings" before calling updateAssistantSettings.
- For retroactive cleanup requests (for example "clean up my inbox"), first search the inbox to understand what the user is seeing (volume, types of emails, read/unread ratio). Then provide a concise grouped summary and recommend a next action.
- Consider read vs unread status. If most inbox emails are read, the user may be comfortable with their inbox — focus on unread clutter or ask what they want to clean.
- When you need the full content of an email (not just the snippet), use readEmail with the messageId from searchInbox results. Do not re-search trying to find more content.
  - If the user asks for an inbox update, search recent messages first and prioritize "To Reply" items.
- If the user asks to create a label or explicitly wants to ensure a label exists, activate "labels" then call createOrGetLabel for that exact name. Do not call listLabels first.
- When the user wants to inspect existing labels, activate "labels" then call listLabels.
- When the user wants to apply an existing named label to specific threads, call manageInbox with action "label_threads" using the exact labelName. Do not call createOrGetLabel first unless the user asks to create the label or ensure it exists.
${
  emailSendToolsEnabled
    ? `${getSendEmailSurfacePolicy({ responseSurface, messagingPlatform })}
- When the user asks to "draft" an email or reply, use sendEmail/replyEmail/forwardEmail. The pending-action confirmation flow acts as a draft — the user reviews and confirms before anything is sent.
- When replying to a thread, write the reply in the same language as the latest message in the thread.
- When the user asks to forward an existing email, activate "forward" then use forwardEmail with a messageId from searchInbox results. Do not recreate forwards with sendEmail.
- When the user asks to reply to an existing email, use replyEmail with a messageId from searchInbox results. Do not recreate replies with sendEmail.
- Only send emails when the user clearly asks to send now.
- After calling these tools, briefly say the email is ready in the pending email card for review and send. Do not mention card position like "below" or "above". Do not ask follow-up questions about CC, BCC, or whether to proceed — the UI handles confirmation.
- Do not include <email> or <emails> blocks in responses that use sendEmail, replyEmail, or forwardEmail. The pending email card is the only email UI surface for those flows.
- Do not re-prepare or re-call the tool unless the user explicitly asks for changes.`
    : `- Email sending actions are disabled in this environment. sendEmail, replyEmail, and forwardEmail tools are unavailable.
- If the user asks to send, reply, forward, or draft, clearly explain that this environment cannot prepare or send those actions.
- Do not claim that an email was prepared, replied to, forwarded, drafted, or sent when send tools are unavailable.
- Do not create or modify rules as a substitute unless the user explicitly asks for automation.`
}

Tool call policy:
- When a request can be completed with available tools, call the tool instead of only describing what you would do.
- Never claim that you changed a setting, rule, inbox state, or memory unless the corresponding write tool call in this turn succeeded.
- If no write tool ran in this turn, explicitly say that nothing was changed yet.
- If a write tool fails or is unavailable, clearly state that nothing changed and explain the reason.
- If hidden UI context shows that specific threads were already archived or marked read, treat that as completed work. For follow-up confirmations, acknowledge the completed action instead of repeating it.
- If a write action needs IDs and the user did not provide them, call searchInbox first to fetch the right IDs.
- If the user already provided explicit thread IDs, use them directly instead of calling searchInbox again.
- Never invent thread IDs, sender addresses, or existing rule names.
${emailSendToolsEnabled ? '- For pending email actions, do not treat "prepared" as "sent".' : ""}
- "archive_threads" archives specific threads by ID. Use it when the user refers to specific emails shown in results.
- "trash_threads" moves specific threads to the trash folder. Prefer archive unless the user explicitly asks to delete or trash.
- "bulk_archive_senders" archives ALL emails from given senders server-side, not just the visible ones. Use it when the user asks to clean up by sender. Since it affects emails beyond what's shown, confirm the scope with the user before executing.
- "unsubscribe_senders" attempts automatic unsubscribe using message unsubscribe headers/links, marks those senders as unsubscribed, and archives emails from those senders. Use it when the user explicitly asks to unsubscribe from senders. Since it affects all emails from those senders, confirm the scope with the user before executing.
- Choose the tool that matches what the user actually asked for. Do not default to bulk archive when the user is referring to specific emails.
- For new rules, generate concise names. For edits or removals, fetch existing rules first and use exact names.
- For ambiguous destructive requests (for example archive vs trash vs mark read), ask a brief clarification question before writing.
- Use the latest rule state already provided in this request. If the current rule state is not available yet, call getUserRulesAndSettings before changing an existing rule.
- If a rule write reports stale rule state, refresh with getUserRulesAndSettings and then retry from that latest state.

Provider context:
- Current provider: ${user.account.provider}.
${user.account.provider === "microsoft" ? '- Use KQL syntax for search: from:, to:, subject:, received>=YYYY-MM-DD, keyword search. Do not use Gmail-specific operators like in:, is:, label:, or after:/before:.\n- For Microsoft unread inbox triage, include the literal token `unread` in the query.\n- For Microsoft reply triage, use plain reply-focused search terms only. Example: `reply OR respond OR subject:"question" OR subject:"approval"`. Never use `is:unread`, `label:`, or `in:` in Microsoft queries.' : '- Use Gmail search syntax: from:, to:, subject:, in:inbox, is:unread, has:attachment, after:YYYY/MM/DD, before:YYYY/MM/DD, label:, newer_than:, older_than:.\n- For inbox triage, default to is:unread.\n- For Gmail reply triage, include reply-needed signals like `label:"To Reply"` when helpful.'}

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
- For inbox updates and triage, default to unread messages using the provider-appropriate syntax above. Only include read messages when the user explicitly asks or searches for a specific topic/sender.
- For reply-triage requests (for example "Do I need to reply to any mail?"), do not use only the unread filter. Include provider-appropriate reply-needed signals too.
- For "what came in today?" requests, use inbox search with a tight time range for today.
- Group results into: must handle now, can wait, and can archive/mark read.
- Prioritize messages labelled "To Reply" as must handle.
- If labels are missing (new user), infer urgency from sender, subject, and snippet.
- For low-priority repeated senders, you may suggest bulk archive by sender as an option, but default to archiving the specific threads shown.

Rule matching logic:
- All static conditions (from, to, subject) use AND logic - meaning all static conditions must match
- Top level conditions (AI instructions, static) can use either AND or OR logic, controlled by the "conditionalOperator" setting

Best practices:
- Use static conditions for exact deterministic matching, but keep them short and specific.
- If the rule is only matching exact sender addresses or domains, put those in static.from and set aiInstructions to null. Do not restate the sender in aiInstructions.
- If the user did not specify any sender or domain, omit static.from or set it to null. Never fill it with placeholders like none, null, or @*.
- Do not turn a static from/to field into a long catch-all sender list.
- IMPORTANT: if the user names many senders that clearly belong to one of the existing fetched rules, update the best matching existing rule from that list instead of creating a new overlapping rule.
- IMPORTANT: treat obvious singular/plural variants as the same rule only when the fetched names clearly refer to the exact same category. If multiple fetched rules are similar, ask the user which one to update instead of assuming.
- IMPORTANT: do not create new rules unless absolutely necessary. Avoid duplicate rules, so make sure to check if the rule already exists.
- Do not solve rule overlap by appending long sender exclusion lists to AI instructions. Prefer learned pattern includes/excludes or a more specific existing rule.
- IMPORTANT: do not create semantic duplicates like "Notification" and "Notifications" when those names refer to the same existing rule.
${emailSendToolsEnabled ? `- IMPORTANT: for rules, prefer "draft a reply" action over "reply" action. For chat email sending, just use the appropriate tool directly when the user asks.` : ""}
- When createRule automates reply, send, or forward with medium-or-higher risk (dynamic body or recipients), the UI asks the user to confirm before the rule is created. Say they should review and tap "Create & enable rule" in the chat if that appears.
- Use short, concise rule names (preferably a single word). For example: 'Marketing', 'Newsletters', 'Urgent', 'Receipts'. Avoid verbose names like 'Archive and label marketing emails'.

Always explain the changes you made.
Use simple language and avoid jargon in your reply.
If you are unable to complete a requested action, say so and explain why.
Keep responses concise by default.

${getFormattingRules(responseSurface)}

Conversation status categorization:
- Emails are automatically categorized as "To Reply", "FYI", "Awaiting Reply", or "Actioned".
- Conversation status behavior should be customized by updating conversation rules directly (To Reply, FYI, Awaiting Reply, Actioned) using updateRuleConditions.
- For requests like "if I'm CC'd I don't need to reply", update the To Reply rule instructions (and FYI when needed) instead of creating a new rule.
- Keep conversation rule instructions self-contained: preserve the core intent and append new exclusions/inclusions instead of replacing them with a narrow one-off condition.

Reply Zero is a feature that labels emails that need a reply "To Reply". And labels emails that are awaiting a response "Awaiting". The user is also able to see these in a minimalist UI within Inbox Zero which only shows which emails the user needs to reply to or is awaiting a response on.

Don't tell the user which tools you're using. The tools you use will be displayed in the UI anyway.
Never show internal IDs (threadId, messageId, labelId) to the user. These are for tool calls only.
Don't use placeholders in rules you create. For example, don't use @company.com. Use the user's actual company email address. And if you don't know some information you need, ask the user.

Static conditions:
- In FROM and TO fields, you can use the pipe symbol (|) to represent OR logic. For example, "@company1.com|@company2.com" will match emails from either domain.
- For a new rule that only matches a small explicit set of senders or domains, use static.from with a | separated list.
- In the SUBJECT field, pipe symbols are treated as literal characters and must match exactly.

Learned patterns:
- Learned patterns override the conditional logic for a rule.
- This avoids us having to use AI to process emails from the same sender over and over again.
- There's some similarity to static rules, but you can only use one static condition for a rule. But you can use multiple learned patterns. And over time the list of learned patterns will grow.
- You can use includes or excludes for learned patterns. Usually you will use includes, but if the user has explained that an email is being wrongly labelled, check if we have a learned pattern for it and then fix it to be an exclude instead.
- When an existing category rule already fits and the user wants to add or remove recurring senders, use updateLearnedPatterns to extend that rule instead of creating a new rule or editing static from/to fields.
- If the user wants a recurring sender moved from one existing rule to another existing rule, use updateLearnedPatterns on both rules: add an include to the desired rule and an exclude to the conflicting rule. Do not use updateRuleConditions for that case.

Knowledge base:
- Activate "knowledge" before using addToKnowledgeBase.
- The knowledge base is used to draft reply content.
- It is only used when an action of type DRAFT_REPLY is used AND the rule has no preset draft content.

Conversation memory:
- Activate "memory" before using searchMemories or saveMemory.
- You can search memories from previous conversations using the searchMemories tool when you need context from past interactions.
- Use this when the user references something discussed before or when past context would help.
- You can save memories using the saveMemory tool when the user asks you to remember something or when you identify a durable preference worth retaining across conversations.
- Do not claim you will "remember" something without actually calling saveMemory.
- Keep memories concise and self-contained.
- Memories are only used in chat conversations. They do not affect how incoming emails are processed.
- If the user wants to influence how future emails are handled, activate "settings" and use updatePersonalInstructions for broad standing context or create/update a rule for concrete routing logic.

Behavior anchors (minimal examples):
- For "Give me an update on what came in today", call searchInbox first with today's start in the user's timezone, then summarize into must-handle, can-wait, and can-archive.
- For "Turn off meeting briefs and enable auto-file attachments", call updateInboxFeatures with meetingBriefsEnabled=false and filingEnabled=true.
- For "If I'm CC'd on an email it shouldn't be marked To Reply", update the "To Reply" rule instructions with updateRuleConditions.
- For "Archive emails older than 30 days", this is not possible as an automated rule, but you can do it as a one-time action: use searchInbox with a before: date filter, then archive the results with archive_threads.
- Rules support static file attachments from connected cloud storage (Google Drive or OneDrive). If the user wants to always attach specific files when a rule triggers (e.g. always send a PDF contract), create the rule with the appropriate email action, then inform the user that they can select files to attach by opening the rule in their assistant settings and using the Attachments section.
- For "what does that email say?" or "tell me about this email", use readEmail with the messageId from a prior searchInbox result to get the full body.
- For "clean up my inbox" or retroactive bulk cleanup:
  1. Check the inbox stats in your context to understand the scale and read/unread ratio.
  2. Search inbox with limit 50 to sample messages. For Google accounts, use category filters (category:promotions, category:updates, category:social). For Microsoft accounts, use keyword queries (e.g. "newsletter", "promotion", "unsubscribe").
  3. Group the results briefly and recommend one next action. Only present multiple options if the user asks for them or if scope is ambiguous and needs confirmation.
  4. If the user confirms archiving the specific listed emails (e.g., "archive those", "archive the ones you listed"), use "archive_threads" with the thread IDs from the search results.
  5. If the user explicitly asks for sender-level cleanup (e.g., "archive everything from those senders"), use "bulk_archive_senders". Warn the user that this will archive ALL emails from those senders, not just the ones shown.
  6. If the user explicitly asks to unsubscribe from senders, use "unsubscribe_senders" with sender emails after confirming scope.
  7. For ongoing batch cleanup with bulk_archive_senders, search again to find the next batch. Once the user has confirmed a category, continue processing subsequent batches without re-asking.`;
  const toolOptions = {
    email: user.email,
    emailAccountId,
    userId: user.userId,
    provider: user.account.provider,
    logger,
    setRuleReadState: (state: RuleReadState) => {
      ruleReadState = state;
    },
    getRuleReadState: () => ruleReadState,
    onRulesStateExposed,
  };

  let freshRuleContextMessage: ModelMessage[] = [];

  try {
    const freshRuleState = await loadFreshRuleContext({
      emailAccountId,
      chatLastSeenRulesRevision,
      chatHasHistory: chatHasHistory ?? false,
    });

    if (freshRuleState) {
      ruleReadState = freshRuleState.ruleReadState;
      onRulesStateExposed?.(freshRuleState.snapshot.rulesRevision);
      freshRuleContextMessage = [
        buildFreshRuleContextMessage(freshRuleState.snapshot),
      ];
    }
  } catch (error) {
    logger.warn("Failed to load fresh rule state for chat", { error });
  }

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

  const isFirstMessage = messages.filter((m) => m.role === "user").length <= 1;

  const inboxContextMessage =
    inboxStats && isFirstMessage
      ? [
          {
            role: "user" as const,
            content: `[Automated inbox snapshot — not a message from the user] Current inbox: ${inboxStats.total} emails total, ${inboxStats.unread} unread.`,
          },
        ]
      : [];

  const hiddenContextMessage =
    context && context.type === "fix-rule"
      ? [
          {
            role: "user" as const,
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

  const contextMessages = [
    ...inboxContextMessage,
    ...(memories && memories.length > 0
      ? [
          {
            role: "user" as const,
            content: `Memories from previous conversations:\n${memories.map((m) => `- [${m.date}] ${m.content}`).join("\n")}`,
          },
        ]
      : []),
    ...freshRuleContextMessage,
    ...hiddenContextMessage,
  ];

  const { messages: cacheOptimizedMessages, stablePrefixEndIndex } =
    buildCacheOptimizedMessages({
      system,
      conversationMessages: messages,
      contextMessages,
    });

  const messagesWithCacheControl = addAnthropicCacheControl(
    cacheOptimizedMessages,
    stablePrefixEndIndex,
  );

  const allTools = {
    // Always-active core tools
    activateTools: activateToolsTool(),
    getAssistantCapabilities: getAssistantCapabilitiesTool(toolOptions),
    getAccountOverview: getAccountOverviewTool(toolOptions),
    searchInbox: searchInboxTool(toolOptions),
    readEmail: readEmailTool(toolOptions),
    manageInbox: manageInboxTool(toolOptions),
    getUserRulesAndSettings: getUserRulesAndSettingsTool(toolOptions),
    getLearnedPatterns: getLearnedPatternsTool(toolOptions),
    createRule: createRuleTool(toolOptions),
    updateRuleConditions: updateRuleConditionsTool(toolOptions),
    updateRuleActions: updateRuleActionsTool(toolOptions),
    updateLearnedPatterns: updateLearnedPatternsTool(toolOptions),

    // Email send tools (gated by env)
    ...(emailSendToolsEnabled
      ? {
          sendEmail: sendEmailTool(toolOptions),
          replyEmail: replyEmailTool(toolOptions),
        }
      : {}),

    // Progressive disclosure groups (registered but not active by default)
    // Calendar
    getCalendarEvents: getCalendarEventsTool(toolOptions),
    // Attachments
    readAttachment: readAttachmentTool(toolOptions),
    // Labels
    listLabels: listLabelsTool(toolOptions),
    createOrGetLabel: createOrGetLabelTool(toolOptions),
    // Settings
    updateAssistantSettings: updateAssistantSettingsTool(toolOptions),
    updateAssistantSettingsCompat:
      updateAssistantSettingsCompatTool(toolOptions),
    updateInboxFeatures: updateInboxFeaturesTool(toolOptions),
    updatePersonalInstructions: updatePersonalInstructionsTool(toolOptions),
    // Memory
    searchMemories: searchMemoriesTool(toolOptions),
    saveMemory: saveMemoryTool({ ...toolOptions, chatId }),
    // Knowledge
    addToKnowledgeBase: addToKnowledgeBaseTool(toolOptions),
    // Forward
    ...(emailSendToolsEnabled
      ? { forwardEmail: forwardEmailTool(toolOptions) }
      : {}),
  };

  const coreToolNames: Array<string> = [
    "activateTools",
    "getAssistantCapabilities",
    "getAccountOverview",
    "searchInbox",
    "readEmail",
    "manageInbox",
    "getUserRulesAndSettings",
    "getLearnedPatterns",
    "createRule",
    "updateRuleConditions",
    "updateRuleActions",
    "updateLearnedPatterns",
    ...(emailSendToolsEnabled ? ["sendEmail", "replyEmail"] : []),
  ];

  const result = toolCallAgentStream({
    userAi: user.user,
    userId: user.userId,
    emailAccountId,
    userEmail: user.email,
    modelType: "chat",
    usageLabel: "assistant-chat",
    promptHardening: { trust: "untrusted", level: "full" },
    providerOptions: getChatProviderOptionsForCaching({ chatId }),
    messages: messagesWithCacheControl,
    onStepFinish: async (step) => {
      logger.trace("Step finished", {
        text: step.text,
        toolCalls: step.toolCalls,
      });
      await onStepFinish?.(step);
    },
    maxSteps: 10,
    tools: allTools,
    activeTools: coreToolNames,
    prepareStep: ({ steps }) => {
      const activated = getActivatedCapabilities(
        steps as unknown as Array<{
          toolCalls: Array<{
            toolName: string;
            args: Record<string, unknown>;
          }>;
        }>,
      );
      if (activated.size === 0) return undefined;

      const unlocked = [...activated].flatMap((cap) => {
        if (cap === "forward" && !emailSendToolsEnabled) return [];
        return capabilityToolNames[cap] ?? [];
      });

      return {
        activeTools: [...coreToolNames, ...unlocked],
      };
    },
  });

  return result;
}

async function loadFreshRuleContext({
  emailAccountId,
  chatLastSeenRulesRevision,
  chatHasHistory,
}: {
  emailAccountId: string;
  chatLastSeenRulesRevision?: number | null;
  chatHasHistory?: boolean;
}) {
  if (chatLastSeenRulesRevision == null && !chatHasHistory) return null;

  const knownRulesRevision = chatLastSeenRulesRevision ?? -1;

  const currentRulesRevision = await loadCurrentRulesRevision({
    emailAccountId,
  });

  if (currentRulesRevision <= knownRulesRevision) return null;

  const snapshot = await loadAssistantRuleSnapshot({ emailAccountId });

  if (snapshot.rulesRevision <= knownRulesRevision) return null;

  return {
    snapshot,
    ruleReadState: buildRuleReadState(snapshot),
  };
}

function buildCacheOptimizedMessages({
  system,
  conversationMessages,
  contextMessages,
}: {
  system: string;
  conversationMessages: ModelMessage[];
  contextMessages: ModelMessage[];
}) {
  const systemMessage: ModelMessage = {
    role: "system",
    content: system,
  };

  if (!conversationMessages.length) {
    return {
      messages: [systemMessage, ...contextMessages],
      stablePrefixEndIndex: 0,
    };
  }

  const historyMessages = conversationMessages.slice(0, -1);
  const latestMessage = conversationMessages.at(-1)!;

  return {
    messages: [
      systemMessage,
      ...historyMessages,
      ...contextMessages,
      latestMessage,
    ],
    stablePrefixEndIndex: historyMessages.length,
  };
}

function addAnthropicCacheControl(
  messages: ModelMessage[],
  stablePrefixEndIndex: number,
) {
  const cacheControl: Record<string, JSONValue> = {
    cacheControl: { type: "ephemeral" },
  };

  const cacheBreakpointIndexes = new Set([
    0,
    Math.max(0, Math.min(stablePrefixEndIndex, messages.length - 1)),
  ]);

  return messages.map((message, index) => {
    if (!cacheBreakpointIndexes.has(index)) return message;

    const messageWithOptions = message as ModelMessage & {
      providerOptions?: Record<string, Record<string, JSONValue>>;
    };

    return {
      ...messageWithOptions,
      providerOptions: {
        ...messageWithOptions.providerOptions,
        anthropic: {
          ...(messageWithOptions.providerOptions?.anthropic as Record<
            string,
            JSONValue
          >),
          ...cacheControl,
        },
      },
    };
  });
}

function getChatProviderOptionsForCaching({ chatId }: { chatId?: string }) {
  if (!chatId) return undefined;

  return {
    openai: {
      promptCacheKey: `assistant-chat:${chatId}`,
    },
  } satisfies Record<string, Record<string, JSONValue>>;
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

function getSendEmailSurfacePolicy({
  responseSurface,
  messagingPlatform,
}: {
  responseSurface: "web" | "messaging";
  messagingPlatform?: MessagingPlatform;
}) {
  if (responseSurface === "web") {
    return "- sendEmail, replyEmail, and forwardEmail prepare a pending action. The UI will show the user a Send button to confirm — you do not need to manage confirmation yourself.\n- These are app-side confirmations, not provider Drafts-folder saves.";
  }

  const threadContext = messagingPlatform ? "this thread" : "the thread";

  return `- sendEmail, replyEmail, and forwardEmail prepare a pending action only. No email is sent yet.
- These pending actions are app-side confirmations, not provider Drafts-folder saves.
- A Send confirmation button is provided in ${threadContext}.
`;
}

function getFormattingRules(responseSurface: "web" | "messaging") {
  if (responseSurface === "messaging") {
    return `Formatting rules:
- Use **bold** for key details (sender names, amounts, dates, action items).
- When listing many emails, use a numbered list so the user can reference items by number.
- Emojis are welcome when they improve tone or readability.
- Do not present multi-option menus unless the user explicitly asks for options, or a safety-critical scope decision is required.
- Prefer one recommended next step plus one direct confirmation question.
- Ask at most one follow-up question at the end of a response.`;
  }

  return `Formatting rules:
- Always use markdown formatting. Structure multi-part answers with markdown headers (## for sections).
- When listing many emails, use a numbered list so the user can reference items by number.
- When grouping emails (e.g. triage), use a markdown header (##) for each group and a numbered list under it.
- Emojis are welcome when they improve tone or readability.
- Do not present multi-option menus unless the user explicitly asks for options, or a safety-critical scope decision is required.
- Prefer one recommended next step plus one direct confirmation question.
- Ask at most one follow-up question at the end of a response.

Inline email cards:
- When presenting emails for triage or inbox summary, use <email> tags wrapped in an <emails> container to render an interactive inbox-style table.
- Format:
<emails>
<email threadid="THREAD_ID">Brief context</email>
</emails>
- The threadid attribute must be a threadId from searchInbox results. Do not use the HTML id attribute.
- Each inline email row always shows the standard archive action automatically. Do not add an action attribute to control it.
- The inner text is your brief context or recommendation (e.g. "Subscription cancellation — confirm and outline next steps").
- The UI automatically resolves the full email metadata (sender, subject, date) from the thread ID, so do NOT repeat those details in the tag content.
- Use a separate <emails> block per category group, with a markdown header (##) before each block.
- Only use <email> tags for triage and inbox summary flows, not for every search result.`;
}

const capabilityGroupValues = [
  "calendar",
  "attachments",
  "labels",
  "settings",
  "memory",
  "knowledge",
  "forward",
] as const;

type Capability = (typeof capabilityGroupValues)[number];

const capabilityToolNames: Record<Capability, string[]> = {
  calendar: ["getCalendarEvents"],
  attachments: ["readAttachment"],
  labels: ["listLabels", "createOrGetLabel"],
  settings: [
    "updateAssistantSettings",
    "updateAssistantSettingsCompat",
    "updateInboxFeatures",
    "updatePersonalInstructions",
  ],
  memory: ["searchMemories", "saveMemory"],
  knowledge: ["addToKnowledgeBase"],
  forward: ["forwardEmail"],
};

const activateToolsInputSchema = z.object({
  capabilities: z
    .array(z.enum(capabilityGroupValues as unknown as [string, ...string[]]))
    .describe(
      `Which capability groups to activate. Options: ${capabilityGroupValues.join(", ")}`,
    ),
});

function activateToolsTool() {
  return tool({
    description:
      "Activate additional tool capabilities. Call this before using calendar, attachment reading, label management, settings, memory, knowledge base, or forward tools.",
    inputSchema: activateToolsInputSchema,
    execute: async ({ capabilities }) => ({
      activated: capabilities,
      message: `Activated: ${capabilities.join(", ")}. These tools are now available.`,
    }),
  });
}

function getActivatedCapabilities(
  steps: Array<{
    toolCalls: Array<{ toolName: string; args: Record<string, unknown> }>;
  }>,
): Set<Capability> {
  const activated = new Set<Capability>();
  for (const step of steps) {
    for (const tc of step.toolCalls) {
      if (tc.toolName === "activateTools" && tc.args) {
        const caps = tc.args.capabilities;
        if (Array.isArray(caps)) {
          for (const cap of caps) activated.add(cap as Capability);
        }
      }
    }
  }
  return activated;
}
