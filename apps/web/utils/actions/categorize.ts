"use server";

import { categorise } from "@/app/api/ai/categorise/controller";
import {
  type CategoriseBodyWithHtml,
  categoriseBodyWithHtml,
} from "@/app/api/ai/categorise/validation";
import { getSessionAndGmailClient } from "@/utils/actions/helpers";
import type { ServerActionResponse } from "@/utils/error";
import { hasPreviousEmailsFromSender } from "@/utils/gmail/message";
import { getAiProviderAndModel } from "@/utils/llms";
import { emailToContent } from "@/utils/mail";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";
import { truncate } from "@/utils/string";
import prisma from "@/utils/prisma";

export async function categorizeAction(
  unsafeBody: CategoriseBodyWithHtml,
): Promise<ServerActionResponse<{ category: string }>> {
  const { gmail, user: u, error } = await getSessionAndGmailClient();
  if (error) return { error };
  if (!gmail) return { error: "Could not load Gmail" };

  const {
    success,
    data,
    error: parseError,
  } = categoriseBodyWithHtml.safeParse(unsafeBody);
  if (!success) return { error: parseError.message };

  const content = emailToContent(data);

  const user = await prisma.user.findUnique({
    where: { id: u.id },
    select: {
      aiProvider: true,
      aiModel: true,
      openAIApiKey: true,
    },
  });

  if (!user) return { error: "User not found" };

  const unsubscribeLink = findUnsubscribeLink(data.textHtml);
  const hasPreviousEmail = await hasPreviousEmailsFromSender(gmail, data);

  const { model, provider } = getAiProviderAndModel(
    user.aiProvider,
    user.aiModel,
  );

  const res = await categorise(
    {
      ...data,
      content,
      snippet: data.snippet || truncate(content, 300),
      openAIApiKey: user.openAIApiKey,
      aiProvider: provider,
      aiModel: model,
      unsubscribeLink,
      hasPreviousEmail,
    },
    { email: u.email! },
  );

  return res;
}
