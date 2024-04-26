import { gmail_v1 } from "googleapis";
import {
  excuteRuleActions,
  getFunctionsFromRules,
} from "@/app/api/ai/act/controller";
import prisma from "@/utils/prisma";
import { ParsedMessage } from "@/utils/types";
import { GroupItemType, User } from "@prisma/client";
import { emailToContent } from "@/utils/mail";
import {
  getActionItemsFromAiArgsResponse,
  getArgsAiResponse,
} from "@/app/api/ai/act/ai-choose-args";

export async function handleGroupRule({
  message,
  user,
  gmail,
  isThread,
}: {
  message: ParsedMessage;
  user: Pick<
    User,
    "id" | "email" | "aiModel" | "aiProvider" | "openAIApiKey" | "about"
  >;
  gmail: gmail_v1.Gmail;
  isThread: boolean;
}): Promise<{ handled: boolean }> {
  const groups = await getGroups(user.id);

  // check if matches group
  const match = findMatchingGroup(message, groups);
  if (!match) return { handled: false };
  if (!match.rule) return { handled: true };
  if (isThread && !match.rule.runOnThreads) return { handled: true };

  const email = {
    from: message.headers.from,
    to: message.headers.to,
    subject: message.headers.subject,
    headerMessageId: message.headers["message-id"] || "",
    messageId: message.id,
    snippet: message.snippet,
    textHtml: message.textHtml || null,
    textPlain: message.textPlain || null,
    threadId: message.threadId,
    cc: message.headers.cc || undefined,
    date: message.headers.date,
    references: message.headers.references,
    replyTo: message.headers["reply-to"],
    content: emailToContent({
      textHtml: message.textHtml || null,
      textPlain: message.textPlain || null,
      snippet: message.snippet || null,
    }),
  };

  const functions = getFunctionsFromRules({ rules: [match.rule] });
  const shouldAiGenerateArgs =
    functions.rulesWithProperties[0].shouldAiGenerateArgs;

  // generate args
  const aiArgsResponse = shouldAiGenerateArgs
    ? await getArgsAiResponse({
        email,
        selectedFunction: functions.functions[0],
        aiModel: user.aiModel,
        aiProvider: user.aiProvider,
        openAIApiKey: user.openAIApiKey,
        userAbout: user.about || "",
        userEmail: user.email || "",
      })
    : undefined;

  const actionItems = getActionItemsFromAiArgsResponse(
    aiArgsResponse,
    match.rule.actions,
  );

  // handle action
  // TODO use automate/thread toggle
  await excuteRuleActions(
    {
      gmail,
      userId: user.id,
      userEmail: user.email || "",
      allowExecute: true,
      email,
    },
    {
      rule: match.rule,
      actionItems,
    },
  );

  return { handled: true };
}

type Groups = Awaited<ReturnType<typeof getGroups>>;
async function getGroups(userId: string) {
  return prisma.group.findMany({
    where: { userId },
    include: { items: true, rule: { include: { actions: true } } },
  });
}

function findMatchingGroup(message: ParsedMessage, groups: Groups) {
  const { from, subject } = message.headers;

  const group = groups.find((group) =>
    group.items.some((item) => {
      if (item.type === GroupItemType.FROM) {
        return item.value.includes(from);
      }

      if (item.type === GroupItemType.SUBJECT) {
        return item.value.includes(subject);
      }

      // TODO
      // if (item.type === GroupItemType.BODY) {
      //   return item.value.includes(body);
      // }

      return false;
    }),
  );

  return group;
}
