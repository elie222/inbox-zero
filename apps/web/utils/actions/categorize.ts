"use server";

import { revalidatePath } from "next/cache";
import uniq from "lodash/uniq";
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
import { SenderCategory } from "@/app/api/user/categorize/senders/categorize-sender";
import { defaultReceiptSenders } from "@/utils/ai/group/find-receipts";
import { newsletterSenders } from "@/utils/ai/group/find-newsletters";
import { getRandomColor } from "@/utils/colors";
import { auth } from "@/app/api/auth/[...nextauth]/auth";

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

    // TODO: fetch from gmail, run ai, then fetch from gmail,...
    // we can run ai and gmail fetch in parallel

    const sendersResult = await findSenders(gmail, undefined, 100);
    // const sendersResult = await findSendersWithPagination(gmail, 5);

    const senders = uniq(Array.from(sendersResult.senders.keys()));

    // remove senders we've already categorized
    const existingSenders = await prisma.newsletter.findMany({
      where: { email: { in: senders }, userId: u.id },
      select: { email: true },
    });

    const sendersToCategorize = senders.filter(
      (sender) => !existingSenders.some((s) => s.email === sender),
    );

    const categorizedSenders =
      preCategorizeSendersWithStaticRules(sendersToCategorize);

    const sendersToCategorizeWithAi = categorizedSenders
      .filter((sender) => !sender.category)
      .map((sender) => sender.sender);

    const aiResults = await aiCategorizeSenders({
      user,
      senders: sendersToCategorizeWithAi,
    });

    // get user categories
    const categories = await prisma.category.findMany({
      where: { OR: [{ userId: u.id }, { userId: null }] },
      select: { id: true, name: true },
    });

    const results = [...categorizedSenders, ...aiResults];

    for (const result of results) {
      if (!result.category) continue;
      let category = categories.find((c) => c.name === result.category);

      if (!category) {
        // create category
        const newCategory = await prisma.category.create({
          data: {
            name: result.category,
            userId: u.id,
            color: getRandomColor(),
          },
        });
        category = newCategory;
        categories.push(category);
      }

      // save category
      await prisma.newsletter.upsert({
        where: { email_userId: { email: result.sender, userId: u.id } },
        update: { categoryId: category.id },
        create: {
          email: result.sender,
          userId: u.id,
          categoryId: category.id,
        },
      });
    }

    return results;
  },
);

// Use static rules to categorize senders if we can, before sending to LLM
function preCategorizeSendersWithStaticRules(
  senders: string[],
): { sender: string; category: SenderCategory | undefined }[] {
  return senders.map((sender) => {
    // if the sender is @gmail.com, @yahoo.com, etc.
    // then mark as "Unknown" (LLM will categorize these as "Personal")
    const personalEmailDomains = [
      "gmail.com",
      "googlemail.com",
      "yahoo.com",
      "hotmail.com",
      "outlook.com",
      "aol.com",
    ];

    if (personalEmailDomains.some((domain) => sender.includes(`@${domain}>`)))
      return { sender, category: SenderCategory.UNKNOWN };

    // newsletters
    if (
      sender.toLowerCase().includes("newsletter") ||
      newsletterSenders.some((newsletter) => sender.includes(newsletter))
    )
      return { sender, category: SenderCategory.NEWSLETTER };

    // support
    if (sender.toLowerCase().includes("support"))
      return { sender, category: SenderCategory.SUPPORT };

    // receipts
    if (defaultReceiptSenders.some((receipt) => sender.includes(receipt)))
      return { sender, category: SenderCategory.RECEIPT };

    return { sender, category: undefined };
  });
}

export const changeSenderCategoryAction = withActionInstrumentation(
  "changeSenderCategory",
  async ({ sender, categoryId }: { sender: string; categoryId: string }) => {
    const session = await auth();
    if (!session) return { error: "Not authenticated" };

    const category = await prisma.category.findUnique({
      where: { id: categoryId, userId: session.user.id },
    });
    if (!category) return { error: "Category not found" };

    await prisma.newsletter.update({
      where: { email_userId: { email: sender, userId: session.user.id } },
      data: { categoryId },
    });

    revalidatePath("/smart-categories");
  },
);
