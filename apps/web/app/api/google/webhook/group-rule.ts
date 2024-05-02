import { gmail_v1 } from "googleapis";
import {
  excuteRuleActions,
  getFunctionsFromRules,
} from "@/app/api/ai/act/controller";
import { ParsedMessage } from "@/utils/types";
import { User } from "@prisma/client";
import { emailToContent } from "@/utils/mail";
import {
  getActionItemsFromAiArgsResponse,
  getArgsAiResponse,
} from "@/app/api/ai/act/ai-choose-args";
import {
  findMatchingGroup,
  getGroups,
} from "@/utils/group/find-matching-group";

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
        user,
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
      user,
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
