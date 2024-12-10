"use server";

import { setUser } from "@sentry/nextjs";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma, { isDuplicateError } from "@/utils/prisma";
import {
  RuleType,
  ExecutedRuleStatus,
  type Action,
  ActionType,
} from "@prisma/client";
import { getGmailClient } from "@/utils/gmail/client";
import { aiCreateRule } from "@/utils/ai/rule/create-rule";
import {
  runRulesOnMessage,
  testRulesOnMessage,
} from "@/utils/ai/choose-rule/run-rules";
import { emailToContent, parseMessage } from "@/utils/mail";
import { getMessage, getMessages } from "@/utils/gmail/message";
import { getThread } from "@/utils/gmail/thread";
import {
  createNewsletterGroupAction,
  createReceiptGroupAction,
} from "@/utils/actions/group";
import { GroupName } from "@/utils/config";
import type { EmailForAction } from "@/utils/ai/actions";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import { isDefined, type ParsedMessage } from "@/utils/types";
import { getSessionAndGmailClient } from "@/utils/actions/helpers";
import { isActionError } from "@/utils/error";
import {
  reportAiMistakeBody,
  type ReportAiMistakeBody,
  saveRulesPromptBody,
  type SaveRulesPromptBody,
} from "@/utils/actions/validation";
import { aiPromptToRules } from "@/utils/ai/rule/prompt-to-rules";
import { aiDiffRules } from "@/utils/ai/rule/diff-rules";
import { aiFindExistingRules } from "@/utils/ai/rule/find-existing-rules";
import { aiGenerateRulesPrompt } from "@/utils/ai/rule/generate-rules-prompt";
import { getLabelById, getLabels, labelVisibility } from "@/utils/gmail/label";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { createScopedLogger } from "@/utils/logger";
import { aiFindSnippets } from "@/utils/ai/snippets/find-snippets";
import { aiRuleFix } from "@/utils/ai/rule/rule-fix";

const logger = createScopedLogger("ai-rule");

export const runRulesAction = withActionInstrumentation(
  "runRules",
  async ({ email, force }: { email: EmailForAction; force: boolean }) => {
    const sessionResult = await getSessionAndGmailClient();
    if (isActionError(sessionResult)) return sessionResult;
    const { gmail, user: u } = sessionResult;

    const user = await prisma.user.findUnique({
      where: { id: u.id },
      select: {
        id: true,
        email: true,
        about: true,
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
        rules: {
          where: { enabled: true },
          include: { actions: true, categoryFilters: true },
        },
      },
    });
    if (!user?.email) return { error: "User email not found" };

    const [gmailMessage, hasExistingRule] = await Promise.all([
      getMessage(email.messageId, gmail, "full"),
      prisma.executedRule.findUnique({
        where: {
          unique_user_thread_message: {
            userId: user.id,
            threadId: email.threadId,
            messageId: email.messageId,
          },
        },
        select: { id: true },
      }),
    ]);

    // fetch after getting the message to avoid rate limiting
    const gmailThread = await getThread(email.threadId, gmail);

    if (hasExistingRule && !force) {
      logger.info("Skipping. Rule already exists.");
      return;
    }

    const message = parseMessage(gmailMessage);
    const isThread = !!gmailThread.messages && gmailThread.messages.length > 1;

    await runRulesOnMessage({
      gmail,
      message,
      rules: user.rules,
      user: { ...user, email: user.email },
      isThread,
    });
  },
);

export const testAiAction = withActionInstrumentation(
  "testAi",
  async ({ messageId, threadId }: { messageId: string; threadId: string }) => {
    const sessionResult = await getSessionAndGmailClient();
    if (isActionError(sessionResult)) return sessionResult;
    const { gmail, user: u } = sessionResult;

    const user = await prisma.user.findUnique({
      where: { id: u.id },
      select: {
        id: true,
        email: true,
        about: true,
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
        rules: {
          where: { enabled: true },
          include: { actions: true, categoryFilters: true },
        },
      },
    });
    if (!user) return { error: "User not found" };

    const [gmailMessage, gmailThread] = await Promise.all([
      getMessage(messageId, gmail, "full"),
      getThread(threadId, gmail),
    ]);

    const message = parseMessage(gmailMessage);
    const isThread = !!gmailThread?.messages && gmailThread.messages.length > 1;

    const result = await testRulesOnMessage({
      gmail,
      message,
      rules: user.rules,
      user: { ...user, email: user.email },
      isThread,
    });

    return result;
  },
);

export const testAiCustomContentAction = withActionInstrumentation(
  "testAiCustomContent",
  async ({ content }: { content: string }) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };
    const gmail = getGmailClient(session);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        about: true,
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
        rules: {
          where: { enabled: true },
          include: { actions: true, categoryFilters: true },
        },
      },
    });
    if (!user) return { error: "User not found" };

    const result = await testRulesOnMessage({
      gmail,
      message: {
        id: "",
        threadId: "",
        snippet: content,
        textPlain: content,
        headers: {
          date: new Date().toISOString(),
          from: "",
          to: "",
          subject: "",
        },
        historyId: "",
        inline: [],
        internalDate: new Date().toISOString(),
      },
      rules: user.rules,
      user,
      isThread: false,
    });

    return result;
  },
);

export const createAutomationAction = withActionInstrumentation<
  [{ prompt: string }],
  { id: string },
  { existingRuleId?: string }
>("createAutomation", async ({ prompt }: { prompt: string }) => {
  const session = await auth();
  const userId = session?.user.id;
  if (!userId) return { error: "Not logged in" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
      email: true,
    },
  });
  if (!user) return { error: "User not found" };
  if (!user.email) return { error: "User email not found" };

  let result: Awaited<ReturnType<typeof aiCreateRule>>;

  try {
    result = await aiCreateRule(prompt, user, user.email);
  } catch (error: any) {
    return { error: `AI error creating rule. ${error.message}` };
  }

  if (!result) return { error: "AI error creating rule." };

  const groupIdResult = await getGroupId(result, userId);
  if (isActionError(groupIdResult)) return groupIdResult;
  return await safeCreateRule(result, userId, groupIdResult);
});

async function createRule(
  result: NonNullable<Awaited<ReturnType<typeof aiCreateRule>>>,
  userId: string,
  groupId: string | null,
) {
  return prisma.rule.create({
    data: {
      name: result.name,
      instructions: result.condition.aiInstructions || "",
      userId,
      type: result.condition.type,
      actions: { createMany: { data: result.actions } },
      automate: shouldAutomate(result.actions),
      runOnThreads: false,
      from: result.condition.static?.from,
      to: result.condition.static?.to,
      subject: result.condition.static?.subject,
      groupId,
    },
  });
}

async function updateRule(
  ruleId: string,
  result: NonNullable<Awaited<ReturnType<typeof aiCreateRule>>>,
  userId: string,
  groupId: string | null,
) {
  return prisma.rule.update({
    where: { id: ruleId },
    data: {
      name: result.name,
      instructions: result.condition.aiInstructions || "",
      userId,
      type: result.condition.type,
      actions: {
        deleteMany: {},
        createMany: { data: result.actions },
      },
      automate: shouldAutomate(result.actions),
      runOnThreads: false,
      from: result.condition.static?.from,
      to: result.condition.static?.to,
      subject: result.condition.static?.subject,
      groupId,
    },
  });
}

async function safeCreateRule(
  result: NonNullable<Awaited<ReturnType<typeof aiCreateRule>>>,
  userId: string,
  groupId: string | null,
) {
  try {
    const rule = await createRule(result, userId, groupId);
    return { id: rule.id };
  } catch (error) {
    if (isDuplicateError(error, "name")) {
      // if rule name already exists, create a new rule with a unique name
      const rule = await createRule(
        { ...result, name: `${result.name} - ${Date.now()}` },
        userId,
        groupId,
      );
      return { id: rule.id };
    }

    logger.info("Error creating rule", {
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack, name: error.name }
          : error,
    });

    return { error: "Error creating rule." };
  }
}

async function safeUpdateRule(
  ruleId: string,
  result: NonNullable<Awaited<ReturnType<typeof aiCreateRule>>>,
  userId: string,
  groupId: string | null,
) {
  try {
    const rule = await updateRule(ruleId, result, userId, groupId);
    return { id: rule.id };
  } catch (error) {
    if (isDuplicateError(error, "name")) {
      // if rule name already exists, create a new rule with a unique name
      const rule = await createRule(
        { ...result, name: `${result.name} - ${Date.now()}` },
        userId,
        groupId,
      );
      return { id: rule.id };
    }

    logger.info("Error updating rule", {
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack, name: error.name }
          : error,
    });

    return { error: "Error updating rule." };
  }
}

async function getGroupId(
  result: NonNullable<Awaited<ReturnType<typeof aiCreateRule>>>,
  userId: string,
) {
  let groupId: string | null = null;

  if (result.condition.group && result.condition.type === RuleType.GROUP) {
    const groups = await prisma.group.findMany({
      where: { userId },
      select: { id: true, name: true, rule: true },
    });

    if (result.condition.group === GroupName.NEWSLETTER) {
      const newsletterGroup = groups.find((g) =>
        g.name.toLowerCase().includes("newsletter"),
      );
      if (newsletterGroup) {
        if (newsletterGroup.rule) {
          return {
            error: "Newsletter group already has a rule",
            existingRuleId: newsletterGroup.rule.id,
          };
        }

        groupId = newsletterGroup.id;
      } else {
        const result = await createNewsletterGroupAction();
        if (isActionError(result)) {
          return result;
        }
        if (!result) {
          return { error: "Error creating newsletter group" };
        }
        groupId = result.id;
      }
    } else if (result.condition.group === GroupName.RECEIPT) {
      const receiptsGroup = groups.find((g) =>
        g.name.toLowerCase().includes("receipt"),
      );

      if (receiptsGroup) {
        groupId = receiptsGroup.id;

        if (receiptsGroup.rule) {
          return {
            error: "Receipt group already has a rule",
            existingRuleId: receiptsGroup.rule.id,
          };
        }
      } else {
        const result = await createReceiptGroupAction();
        if (isActionError(result)) {
          return result;
        }
        if (!result) {
          return { error: "Error creating receipt group" };
        }
        groupId = result.id;
      }
    }
  }

  return groupId;
}

export const deleteRuleAction = withActionInstrumentation(
  "deleteRule",
  async ({ ruleId }: { ruleId: string }) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const rule = await prisma.rule.findUnique({ where: { id: ruleId } });
    if (!rule) return; // already deleted
    if (rule.userId !== session.user.id)
      return { error: "You don't have permission to delete this rule" };

    await prisma.rule.delete({
      where: { id: ruleId, userId: session.user.id },
    });
  },
);

export const setRuleAutomatedAction = withActionInstrumentation(
  "setRuleAutomated",
  async ({ ruleId, automate }: { ruleId: string; automate: boolean }) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    await prisma.rule.update({
      where: { id: ruleId, userId: session.user.id },
      data: { automate },
    });
  },
);

export const setRuleRunOnThreadsAction = withActionInstrumentation(
  "setRuleRunOnThreads",
  async ({
    ruleId,
    runOnThreads,
  }: {
    ruleId: string;
    runOnThreads: boolean;
  }) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    await prisma.rule.update({
      where: { id: ruleId, userId: session.user.id },
      data: { runOnThreads },
    });
  },
);

export const approvePlanAction = withActionInstrumentation(
  "approvePlan",
  async ({
    executedRuleId,
    message,
  }: {
    executedRuleId: string;
    message: ParsedMessage;
  }) => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };

    const gmail = getGmailClient(session);

    const executedRule = await prisma.executedRule.findUnique({
      where: { id: executedRuleId },
      include: { actionItems: true },
    });
    if (!executedRule) return { error: "Item not found" };

    await executeAct({
      gmail,
      email: {
        messageId: executedRule.messageId,
        threadId: executedRule.threadId,
        from: message.headers.from,
        subject: message.headers.subject,
        references: message.headers.references,
        replyTo: message.headers["reply-to"],
        headerMessageId: message.headers["message-id"] || "",
      },
      executedRule,
      userEmail: session.user.email,
    });
  },
);

export const rejectPlanAction = withActionInstrumentation(
  "rejectPlan",
  async ({ executedRuleId }: { executedRuleId: string }) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    await prisma.executedRule.updateMany({
      where: { id: executedRuleId, userId: session.user.id },
      data: { status: ExecutedRuleStatus.REJECTED },
    });
  },
);

/**
 * Saves the user's rules prompt and updates the rules accordingly.
 * Flow:
 * 1. Authenticate user and validate input
 * 2. Compare new prompt with old prompt (if exists)
 * 3. If prompts differ:
 *    a. For existing prompt: Identify added, edited, and removed rules
 *    b. For new prompt: Process all rules as additions
 * 4. Remove rules marked for deletion
 * 5. Edit existing rules that have changes
 * 6. Add new rules
 * 7. Update user's rules prompt in the database
 * 8. Return counts of created, edited, and removed rules
 */
export const saveRulesPromptAction = withActionInstrumentation(
  "saveRulesPrompt",
  async (unsafeData: SaveRulesPromptBody) => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };
    setUser({ email: session.user.email });

    logger.info(
      `Starting saveRulesPromptAction for user ${session.user.email}`,
    );

    const { data, success, error } = saveRulesPromptBody.safeParse(unsafeData);
    if (!success) {
      console.error("Input validation failed:", error.message);
      return { error: error.message };
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        rulesPrompt: true,
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
        email: true,
      },
    });

    if (!user) {
      console.error("User not found");
      return { error: "User not found" };
    }
    if (!user.email) {
      console.error("User email not found");
      return { error: "User email not found" };
    }

    const oldPromptFile = user.rulesPrompt;
    logger.info(
      "Old prompt file:",
      oldPromptFile ? "exists" : "does not exist",
    );

    if (oldPromptFile === data.rulesPrompt) {
      logger.info("No changes in rules prompt, returning early");
      return { createdRules: 0, editedRules: 0, removedRules: 0 };
    }

    let addedRules: Awaited<ReturnType<typeof aiPromptToRules>> | null = null;
    let editRulesCount = 0;
    let removeRulesCount = 0;

    // check how the prompts have changed, and make changes to the rules accordingly
    if (oldPromptFile) {
      logger.info("Comparing old and new prompts");
      const diff = await aiDiffRules({
        user: { ...user, email: user.email },
        oldPromptFile,
        newPromptFile: data.rulesPrompt,
      });

      logger.info(
        `Diff results: Added rules: ${diff.addedRules.length}, Edited rules: ${diff.editedRules.length}, Removed rules: ${diff.removedRules.length}`,
      );

      if (
        !diff.addedRules.length &&
        !diff.editedRules.length &&
        !diff.removedRules.length
      ) {
        logger.info("No changes detected in rules, returning early");
        return { createdRules: 0, editedRules: 0, removedRules: 0 };
      }

      if (diff.addedRules.length) {
        logger.info("Processing added rules");
        addedRules = await aiPromptToRules({
          user: { ...user, email: user.email },
          promptFile: diff.addedRules.join("\n\n"),
          isEditing: false,
        });
        logger.info(`${addedRules?.length || 0} rules to be added`);
      }

      // find existing rules
      const userRules = await prisma.rule.findMany({
        where: { userId: session.user.id, enabled: true },
        include: { actions: true },
      });
      logger.info(`Found ${userRules.length} existing user rules`);

      const existingRules = await aiFindExistingRules({
        user: { ...user, email: user.email },
        promptRulesToEdit: diff.editedRules,
        promptRulesToRemove: diff.removedRules,
        databaseRules: userRules,
      });

      // remove rules
      logger.info(
        `Processing ${existingRules.removedRules.length} rules for removal`,
      );
      for (const rule of existingRules.removedRules) {
        const executedRule = await prisma.executedRule.findFirst({
          where: { userId: session.user.id, ruleId: rule.rule?.id },
        });

        if (!rule.rule) {
          logger.error("Rule not found.");
          continue;
        }

        logger.info(
          `Removing rule. Prompt: ${rule.promptRule}. Rule: ${rule.rule.name}`,
        );

        if (executedRule) {
          await prisma.rule.update({
            where: { id: rule.rule.id, userId: session.user.id },
            data: { enabled: false },
          });
        } else {
          try {
            await prisma.rule.delete({
              where: { id: rule.rule.id, userId: session.user.id },
            });
          } catch (error) {
            logger.error(
              `Error deleting rule. ${error instanceof Error ? error.message : "Unknown error"}`,
              { ruleId: rule.rule.id },
            );
          }
        }

        removeRulesCount++;
      }

      // edit rules
      if (existingRules.editedRules.length > 0) {
        const editedRules = await aiPromptToRules({
          user: { ...user, email: user.email },
          promptFile: existingRules.editedRules
            .map(
              (r) => `Rule ID: ${r.rule?.id}. Prompt: ${r.updatedPromptRule}`,
            )
            .join("\n\n"),
          isEditing: true,
        });

        for (const rule of editedRules) {
          if (!rule.ruleId) {
            console.error(`Rule ID not found for rule. Prompt: ${rule.name}`);
            continue;
          }

          logger.info(`Editing rule. Prompt: ${rule.name}`);

          const groupIdResult = await getGroupId(rule, session.user.id);
          if (isActionError(groupIdResult)) {
            console.error(
              `Error updating group for rule. ${groupIdResult.error}`,
            );
            continue;
          }

          editRulesCount++;

          await safeUpdateRule(
            rule.ruleId,
            rule,
            session.user.id,
            groupIdResult,
          );
        }
      }
    } else {
      logger.info("Processing new rules prompt with AI");
      addedRules = await aiPromptToRules({
        user: { ...user, email: user.email },
        promptFile: data.rulesPrompt,
        isEditing: false,
      });
      logger.info(`${addedRules?.length || 0} rules to be added`);
    }

    // add new rules
    for (const rule of addedRules || []) {
      logger.info(`Creating rule. Prompt: ${rule.name}`);

      const groupIdResult = await getGroupId(rule, session.user.id);
      if (isActionError(groupIdResult)) {
        console.error(`Error creating group for rule. ${groupIdResult.error}`);
        continue;
      }

      await safeCreateRule(rule, session.user.id, groupIdResult);
    }

    // update rules prompt for user
    await prisma.user.update({
      where: { id: session.user.id },
      data: { rulesPrompt: data.rulesPrompt },
    });

    logger.info(
      `saveRulesPromptAction completed. Created rules: ${addedRules?.length || 0}, Edited rules: ${editRulesCount}, Removed rules: ${removeRulesCount}`,
    );

    return {
      createdRules: addedRules?.length || 0,
      editedRules: editRulesCount,
      removedRules: removeRulesCount,
    };
  },
);

function shouldAutomate(actions: Pick<Action, "type">[]) {
  const types = new Set(actions.map((action) => action.type));

  // don't automate replies, forwards, and send emails
  if (
    types.has(ActionType.REPLY) ||
    types.has(ActionType.FORWARD) ||
    types.has(ActionType.SEND_EMAIL)
  ) {
    return false;
  }

  return true;
}

/**
 * Generates a rules prompt based on the user's recent email activity and labels.
 * This function:
 * 1. Fetches the user's 20 most recent sent emails
 * 2. Retrieves the user's Gmail labels
 * 3. Calls an AI function to generate rule suggestions based on this data
 * 4. Returns the generated rules prompt as a string
 */
export const generateRulesPromptAction = withActionInstrumentation(
  "generateRulesPrompt",
  async () => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
        email: true,
        about: true,
      },
    });

    if (!user) return { error: "User not found" };
    if (!user.email) return { error: "User email not found" };

    const gmail = getGmailClient(session);
    const lastSent = await getMessages(gmail, {
      query: "in:sent",
      maxResults: 50,
    });
    const gmailLabels = await getLabels(gmail);
    const userLabels = gmailLabels?.filter((label) => label.type === "user");

    const labelsWithCounts: { label: string; threadsTotal: number }[] = [];

    for (const label of userLabels || []) {
      if (!label.id) continue;
      if (label.labelListVisibility === labelVisibility.labelHide) continue;
      const labelById = await getLabelById({ gmail, id: label.id });
      if (!labelById?.name) continue;
      if (!labelById.threadsTotal) continue; // Skip labels with 0 threads
      labelsWithCounts.push({
        label: labelById.name,
        threadsTotal: labelById.threadsTotal || 0,
      });
    }

    const lastSentMessages = (
      await Promise.all(
        lastSent.messages?.map(async (message) => {
          if (!message.id) return null;
          const gmailMessage = await getMessage(message.id, gmail);
          return parseMessage(gmailMessage);
        }) || [],
      )
    ).filter(isDefined);
    const lastSentEmails = lastSentMessages?.map((message) => {
      return emailToContent(
        {
          textHtml: message.textHtml || null,
          textPlain: message.textPlain || null,
          snippet: message.snippet || null,
        },
        { maxLength: 500 },
      );
    });

    const snippetsResult = await aiFindSnippets({
      user,
      sentEmails: lastSentMessages.map((message) => ({
        from: message.headers.from,
        replyTo: message.headers["reply-to"],
        cc: message.headers.cc,
        subject: message.headers.subject,
        content: emailToContent({
          textHtml: message.textHtml || null,
          textPlain: message.textPlain || null,
          snippet: message.snippet,
        }),
      })),
    });

    const result = await aiGenerateRulesPrompt({
      user,
      lastSentEmails,
      snippets: snippetsResult.snippets.map((snippet) => snippet.text),
      userLabels: labelsWithCounts.map((label) => label.label),
    });

    if (isActionError(result)) return { error: result.error };
    if (!result) return { error: "Error generating rules prompt" };

    return { rulesPrompt: result.join("\n\n") };
  },
);

export const setRuleEnabledAction = withActionInstrumentation(
  "setRuleEnabled",
  async ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    await prisma.rule.update({
      where: { id: ruleId, userId: session.user.id },
      data: { enabled },
    });
  },
);

export const reportAiMistakeAction = withActionInstrumentation(
  "reportAiMistake",
  async (unsafeBody: ReportAiMistakeBody) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const { success, data, error } = reportAiMistakeBody.safeParse(unsafeBody);
    if (!success) return { error: error.message };
    const { ruleId, email, explanation } = data;

    if (!ruleId) return { error: "Rule ID is required" };

    const rule = await prisma.rule.findUnique({
      where: { id: ruleId, userId: session.user.id },
    });
    // TODO: how should we handle this?
    if (!rule?.instructions) return { error: "No instructions for rule" };

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        email: true,
        about: true,
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
      },
    });
    if (!user) return { error: "User not found" };

    const content = emailToContent({
      textHtml: email.textHtml || null,
      textPlain: email.textPlain || null,
      snippet: email.snippet,
    });

    const result = await aiRuleFix({
      user,
      rule,
      email: {
        ...email,
        content,
      },
      explanation: explanation?.trim() || undefined,
    });

    if (isActionError(result)) return { error: result.error };
    if (!result) return { error: "Error fixing rule" };

    return { fixedInstructions: result.fixedInstructions };
  },
);
