"use server";

import { withServerActionInstrumentation } from "@sentry/nextjs";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { RuleType, Prisma, ExecutedRuleStatus } from "@prisma/client";
import { getGmailClient } from "@/utils/gmail/client";
import { isError } from "@/utils/error";
import { aiCreateRule } from "@/utils/ai/rule/create-rule";
import {
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
import { EmailForAction } from "@/utils/ai/actions";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import { ParsedMessage } from "@/utils/types";

export async function runRules(email: EmailForAction) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");
  const gmail = getGmailClient(session);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      about: true,
      aiProvider: true,
      aiModel: true,
      openAIApiKey: true,
      rules: { include: { actions: true } },
    },
  });

  if (!user.email) throw new Error("User email not found");

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

  if (hasExistingRule) {
    console.log("Skipping. Rule already exists.");
    return;
  }

  const message = parseMessage(gmailMessage);
  const isThread = !!gmailThread.messages && gmailThread.messages.length > 1;

  const result = await runRulesOnMessage({
    gmail,
    message,
    rules: user.rules,
    user: { ...user, email: user.email! },
    isThread,
  });

  return { ok: !isError(result) };
}

export type TestAiActionResponse = Awaited<ReturnType<typeof testAiAction>>;
export async function testAiAction({
  messageId,
  threadId,
}: {
  messageId: string;
  threadId: string;
}) {
  return await withServerActionInstrumentation(
    "testAiAction",
    {
      recordResponse: true,
    },
    async () => {
      const session = await auth();
      if (!session?.user.id) throw new Error("Not logged in");
      const gmail = getGmailClient(session);

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: session.user.id },
        select: {
          id: true,
          email: true,
          about: true,
          aiProvider: true,
          aiModel: true,
          openAIApiKey: true,
          rules: { include: { actions: true } },
        },
      });

      const [gmailMessage, gmailThread] = await Promise.all([
        getMessage(messageId, gmail, "full"),
        getThread(threadId, gmail),
      ]);

      const message = parseMessage(gmailMessage);
      const isThread =
        !!gmailThread?.messages && gmailThread.messages.length > 1;

      const result = await testRulesOnMessage({
        gmail,
        message,
        rules: user.rules,
        user: { ...user, email: user.email! },
        isThread,
      });

      return result;
    },
  );
}

export async function testAiCustomContentAction({
  content,
}: {
  content: string;
}) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");
  const gmail = getGmailClient(session);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      about: true,
      aiProvider: true,
      aiModel: true,
      openAIApiKey: true,
      rules: { include: { actions: true } },
    },
  });

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
    user: { ...user, email: user.email! },
    isThread: false,
  });

  return result;
}

export async function createAutomationAction(prompt: string) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { aiProvider: true, aiModel: true, openAIApiKey: true },
  });

  const result = await aiCreateRule(prompt, user, session.user.email);

  if (!result) throw new Error("No result");

  let groupId: string | null = null;

  if (result.group) {
    const groups = await prisma.group.findMany({
      where: { userId: session.user.id },
      select: { id: true, name: true, rule: true },
    });

    if (result.group === "Newsletters") {
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
        const group = await createNewsletterGroupAction({
          name: "Newsletters",
        });
        groupId = group.id;
      }
    } else if (result.group === "Receipts") {
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
        const group = await createReceiptGroupAction({ name: "Receipts" });
        groupId = group.id;
      }
    }
  }

  function getRuleType() {
    // prioritise group rules
    if (result?.group) return RuleType.GROUP;
    if (
      result?.staticConditions?.from ||
      result?.staticConditions?.to ||
      result?.staticConditions?.subject
    )
      return RuleType.STATIC;
    return RuleType.AI;
  }

  async function createRule(
    result: NonNullable<Awaited<ReturnType<typeof aiCreateRule>>>,
    userId: string,
  ) {
    const rule = await prisma.rule.create({
      data: {
        name: result.name,
        instructions: prompt,
        userId,
        type: getRuleType(), // TODO might want to set this to AI if "requiresAI" is true
        actions: {
          createMany: {
            data: result.actions,
          },
        },
        automate: false,
        runOnThreads: false,
        from: result.staticConditions?.from,
        to: result.staticConditions?.to,
        subject: result.staticConditions?.subject,
        groupId,
      },
    });
    return rule;
  }

  try {
    const rule = await createRule(result, session.user.id);
    return { id: rule.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (
        error.code === "P2002" &&
        (error.meta?.target as string[])?.includes?.("name")
      ) {
        // if rule name already exists, create a new rule with a unique name
        const rule = await createRule(
          { ...result, name: result.name + " - " + Date.now() },
          session.user.id,
        );
        return { id: rule.id };
      }
    }
    throw error;
  }
}

export async function deleteRuleAction(ruleId: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.rule.delete({
    where: { id: ruleId, userId: session.user.id },
  });
}

export async function setRuleAutomatedAction(
  ruleId: string,
  automate: boolean,
) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.rule.update({
    where: { id: ruleId, userId: session.user.id },
    data: { automate },
  });
}

export async function setRuleRunOnThreadsAction(
  ruleId: string,
  runOnThreads: boolean,
) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.rule.update({
    where: { id: ruleId, userId: session.user.id },
    data: { runOnThreads },
  });
}

export async function approvePlanAction(
  executedRuleId: string,
  message: ParsedMessage,
) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");

  const gmail = getGmailClient(session);

  const executedRule = await prisma.executedRule.findUniqueOrThrow({
    where: { id: executedRuleId },
    include: { actionItems: true },
  });

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

export async function rejectPlanAction(executedRuleId: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.executedRule.updateMany({
    where: { id: executedRuleId, userId: session.user.id },
    data: { status: ExecutedRuleStatus.REJECTED },
  });
}
