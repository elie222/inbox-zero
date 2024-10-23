"use server";

import { categorize } from "@/app/api/ai/categorize/controller";
import {
  type CategorizeBodyWithHtml,
  categorizeBodyWithHtml,
} from "@/app/api/ai/categorize/validation";
import { getSessionAndGmailClient } from "@/utils/actions/helpers";
import { hasPreviousEmailsFromSender } from "@/utils/gmail/message";
import { emailToContent } from "@/utils/mail";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";
import { truncate } from "@/utils/string";
import prisma from "@/utils/prisma";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { aiCategorizeSenders } from "@/utils/ai/categorize-sender/ai-categorize-senders";
import { findSenders } from "@/app/api/user/categorize/senders/find-senders";

export const categorizeAction = withActionInstrumentation(
  "categorize",
  async (unsafeData: CategorizeBodyWithHtml) => {
    const { gmail, user: u, error } = await getSessionAndGmailClient();
    if (error) return { error };
    if (!gmail) return { error: "Could not load Gmail" };

    const {
      success,
      data,
      error: parseError,
    } = categorizeBodyWithHtml.safeParse(unsafeData);
    if (!success) return { error: parseError.message };

    const content = emailToContent(data);

    const user = await prisma.user.findUnique({
      where: { id: u.id },
      select: {
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
      },
    });

    if (!user) return { error: "User not found" };

    const unsubscribeLink = findUnsubscribeLink(data.textHtml);
    const hasPreviousEmail = await hasPreviousEmailsFromSender(gmail, data);

    const res = await categorize(
      {
        ...data,
        content,
        snippet: data.snippet || truncate(content, 300),
        aiApiKey: user.aiApiKey,
        aiProvider: user.aiProvider,
        aiModel: user.aiModel,
        unsubscribeLink,
        hasPreviousEmail,
      },
      { email: u.email! },
    );

    return { category: res?.category };
  },
);

export const categorizeSendersAction = withActionInstrumentation(
  "categorizeSenders",
  async () => {
    const { gmail, user: u, error } = await getSessionAndGmailClient();
    if (error) return { error };
    if (!gmail) return { error: "Could not load Gmail" };

    const user = await prisma.user.findUnique({
      where: { id: u.id },
      select: {
        email: true,
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
      },
    });

    if (!user) return { error: "User not found" };

    const sendersResult = await findSenders(gmail);

    const senders = Array.from(sendersResult.senders.keys());
    console.log("🚀 ~ senders:", senders);

    const result = await aiCategorizeSenders({ user, senders });
    console.log("🚀 ~ result:", result);

    return result;
  },
);
