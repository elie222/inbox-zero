"use server";

import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma, { isDuplicateError } from "@/utils/prisma";
import {
  RuleType,
  ExecutedRuleStatus,
  Action,
  ActionType,
} from "@prisma/client";
import { getGmailClient } from "@/utils/gmail/client";
import { aiCreateRule } from "@/utils/ai/rule/create-rule";
import {
  type TestResult,
  runRulesOnMessage,
  testRulesOnMessage,
} from "@/utils/ai/choose-rule/run-rules";
import { parseMessage } from "@/utils/mail";
import { getMessage } from "@/utils/gmail/message";
import { getThread } from "@/utils/gmail/thread";
import {
  createNewsletterGroupAction,
  createReceiptGroupAction,
} from "@/utils/actions/group";
import { GroupName } from "@/utils/config";
import type { EmailForAction } from "@/utils/ai/actions";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import type { ParsedMessage } from "@/utils/types";
import { getSessionAndGmailClient } from "@/utils/actions/helpers";
import { type ServerActionResponse, isActionError } from "@/utils/error";
import {
  saveRulesPromptBody,
  SaveRulesPromptBody,
} from "@/utils/actions/validation";
import { aiPromptToRules } from "@/utils/ai/rule/prompt-to-rules";
import { aiDiffRules } from "@/utils/ai/rule/diff-rules";
import { aiFindExistingRules } from "@/utils/ai/rule/find-existing-rules";

export async function runRulesAction(
  email: EmailForAction,
  force: boolean,
): Promise<ServerActionResponse> {
  const { gmail, user: u, error } = await getSessionAndGmailClient();
  if (error) return { error };
  if (!gmail) return { error: "Could not load Gmail" };

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
        include: { actions: true },
      },
    },
  });
  if (!user?.email) return { error: "User email not found" };

  const [gmailMessage, gmailThread, hasExistingRule] = await Promise.all([
    getMessage(email.messageId, gmail, "full"),
    getThread(email.threadId, gmail),
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

  if (hasExistingRule && !force) {
    console.log("Skipping. Rule already exists.");
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
}

export async function testAiAction({
  messageId,
  threadId,
}: {
  messageId: string;
  threadId: string;
}): Promise<ServerActionResponse<TestResult>> {
  const { gmail, user: u, error } = await getSessionAndGmailClient();
  if (error) return { error };
  if (!gmail) return { error: "Could not load Gmail" };

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
        include: { actions: true },
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
}

export async function testAiCustomContentAction({
  content,
}: {
  content: string;
}): Promise<ServerActionResponse<TestResult>> {
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
        include: { actions: true },
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
}

export async function createAutomationAction(
  prompt: string,
): Promise<ServerActionResponse<{ id: string }, { existingRuleId?: string }>> {
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
}

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
        { ...result, name: result.name + " - " + Date.now() },
        userId,
        groupId,
      );
      return { id: rule.id };
    }

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
        { ...result, name: result.name + " - " + Date.now() },
        userId,
        groupId,
      );
      return { id: rule.id };
    }

    return { error: "Error creating rule." };
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
        } else if (!result) {
          return { error: "Error creating newsletter group" };
        } else {
          groupId = result.id;
        }
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
        } else if (!result) {
          return { error: "Error creating receipt group" };
        } else {
          groupId = result.id;
        }
      }
    }
  }

  return groupId;
}

export async function deleteRuleAction(
  ruleId: string,
): Promise<ServerActionResponse> {
  const session = await auth();
  if (!session?.user.id) return { error: "Not logged in" };

  await prisma.rule.delete({
    where: { id: ruleId, userId: session.user.id },
  });
}

export async function setRuleAutomatedAction(
  ruleId: string,
  automate: boolean,
): Promise<ServerActionResponse> {
  const session = await auth();
  if (!session?.user.id) return { error: "Not logged in" };

  await prisma.rule.update({
    where: { id: ruleId, userId: session.user.id },
    data: { automate },
  });
}

export async function setRuleRunOnThreadsAction(
  ruleId: string,
  runOnThreads: boolean,
): Promise<ServerActionResponse> {
  const session = await auth();
  if (!session?.user.id) return { error: "Not logged in" };

  await prisma.rule.update({
    where: { id: ruleId, userId: session.user.id },
    data: { runOnThreads },
  });
}

export async function approvePlanAction(
  executedRuleId: string,
  message: ParsedMessage,
): Promise<ServerActionResponse> {
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
}

export async function rejectPlanAction(
  executedRuleId: string,
): Promise<ServerActionResponse> {
  const session = await auth();
  if (!session?.user.id) return { error: "Not logged in" };

  await prisma.executedRule.updateMany({
    where: { id: executedRuleId, userId: session.user.id },
    data: { status: ExecutedRuleStatus.REJECTED },
  });
}

export async function saveRulesPromptAction(
  unsafeData: SaveRulesPromptBody,
): Promise<ServerActionResponse<{ createdRules: number }>> {
  const session = await auth();
  if (!session?.user.id) return { error: "Not logged in" };

  const data = saveRulesPromptBody.parse(unsafeData);

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

  if (!user) return { error: "User not found" };
  if (!user.email) return { error: "User email not found" };

  const oldPromptFile = user.rulesPrompt;

  if (oldPromptFile === data.rulesPrompt) return { createdRules: 0 };

  let addedRules: Awaited<ReturnType<typeof aiPromptToRules>> | null = null;

  // check how the prompts have changed, and make changes to the rules accordingly
  if (oldPromptFile) {
    const diff = await aiDiffRules({
      user: { ...user, email: user.email },
      oldPromptFile,
      newPromptFile: data.rulesPrompt,
    });

    if (
      diff.addedRules.length === 0 &&
      diff.editedRules.length === 0 &&
      diff.removedRules.length === 0
    ) {
      return { createdRules: 0 };
    }

    addedRules = diff.addedRules.length
      ? await aiPromptToRules({
          user: { ...user, email: user.email },
          promptFile: diff.addedRules.join("\n\n"),
        })
      : null;

    // find existing rules
    const userRules = await prisma.rule.findMany({
      where: { userId: session.user.id },
      include: { actions: true },
    });

    const existingRules = await aiFindExistingRules({
      user: { ...user, email: user.email },
      promptRulesToEdit: diff.editedRules,
      promptRulesToRemove: diff.removedRules,
      databaseRules: userRules,
    });

    // handle removed rules
    for (const rule of existingRules.filter((r) => r.toRemove)) {
      // if the rule has executed rules, disable it
      // if not, then delete it

      const executedRule = await prisma.executedRule.findFirst({
        where: { userId: session.user.id, ruleId: rule.rule?.id },
      });

      console.log(
        `Removing rule. Prompt: ${rule.promptRule}. Rule: ${rule.rule?.name}`,
      );

      if (executedRule) {
        await prisma.rule.update({
          where: { id: rule.rule?.id, userId: session.user.id },
          data: { enabled: false },
        });
      } else {
        await prisma.rule.delete({
          where: { id: rule.rule?.id, userId: session.user.id },
        });
      }
    }

    // adjust edited rules
    const rulesToEdit = existingRules.filter((r) => r.toEdit);

    if (rulesToEdit.length > 0) {
      const editedRules = await aiPromptToRules({
        user: { ...user, email: user.email },
        promptFile: rulesToEdit
          .map((r) => `Rule ID: ${r.rule?.id}. Prompt: ${r.promptRule}`)
          .join("\n\n"),
      });

      for (const rule of editedRules.rules) {
        if (!rule.ruleId) {
          console.error(`Rule ID not found for rule. Prompt: ${rule.name}`);
          continue;
        }

        console.log(`Editing rule. Prompt: ${rule.name}`);

        const groupIdResult = await getGroupId(rule, session.user.id);
        if (isActionError(groupIdResult)) {
          console.error(
            `Error updating group for rule. ${groupIdResult.error}`,
          );
          continue;
        }

        await safeUpdateRule(rule.ruleId, rule, session.user.id, groupIdResult);
      }
    }
  } else {
    addedRules = await aiPromptToRules({
      user: { ...user, email: user.email },
      promptFile: data.rulesPrompt,
    });
  }

  for (const rule of addedRules?.rules || []) {
    console.log(`Creating rule. Prompt: ${rule.name}`);

    const groupIdResult = await getGroupId(rule, session.user.id);
    if (isActionError(groupIdResult)) {
      console.error(`Error creating group for rule. ${groupIdResult.error}`);
      continue;
    }

    await safeCreateRule(rule, session.user.id, groupIdResult);
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { rulesPrompt: data.rulesPrompt },
  });

  return { createdRules: addedRules?.rules.length || 0 };
}

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
