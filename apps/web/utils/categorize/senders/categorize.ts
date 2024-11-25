import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import {
  aiCategorizeSenders,
  REQUEST_MORE_INFORMATION_CATEGORY,
} from "@/utils/ai/categorize-sender/ai-categorize-senders";
import { defaultCategory, type SenderCategory } from "@/utils/categories";
import { isNewsletterSender } from "@/utils/ai/group/find-newsletters";
import { isReceiptSender } from "@/utils/ai/group/find-receipts";
import { aiCategorizeSender } from "@/utils/ai/categorize-sender/ai-categorize-single-sender";
import { getThreadsFromSender } from "@/utils/gmail/thread";
import { isDefined } from "@/utils/types";
import type { Category } from "@prisma/client";
import { getUserCategories } from "@/utils/category.server";
import type { User } from "@prisma/client";
import type { UserAIFields, UserEmailWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import type { SenderMap } from "@/app/api/user/categorize/senders/types";

const logger = createScopedLogger("categorize/senders");

export async function categorizeSender(
  senderAddress: string,
  user: Pick<User, "id" | "email"> & UserAIFields,
  gmail: gmail_v1.Gmail,
) {
  const categories = await getUserCategories(user.id);

  if (categories.length === 0) return { categoryId: undefined };

  const previousEmails = await getPreviousEmails(gmail, senderAddress);

  const aiResult = await aiCategorizeSender({
    user,
    sender: senderAddress,
    previousEmails,
    categories,
  });

  if (aiResult) {
    const { newsletter } = await updateSenderCategory({
      sender: senderAddress,
      categories,
      categoryName: aiResult.category,
      userId: user.id,
    });

    return { categoryId: newsletter.categoryId };
  }

  logger.error(`No AI result for sender: ${senderAddress}`);

  return { categoryId: undefined };
}

async function getPreviousEmails(gmail: gmail_v1.Gmail, sender: string) {
  const threadsFromSender = await getThreadsFromSender(gmail, sender, 3);

  const previousEmails = threadsFromSender
    .map((t) => t?.snippet)
    .filter(isDefined);

  return previousEmails;
}

export async function updateSenderCategory({
  userId,
  sender,
  categories,
  categoryName,
}: {
  userId: string;
  sender: string;
  categories: { id: string; name: string }[];
  categoryName: string;
}) {
  let category = categories.find((c) => c.name === categoryName);
  let newCategory: Category | undefined;

  if (!category) {
    // create category
    newCategory = await prisma.category.create({
      data: {
        name: categoryName,
        userId,
        // color: getRandomColor(),
      },
    });
    category = newCategory;
  }

  // save category
  const newsletter = await prisma.newsletter.upsert({
    where: { email_userId: { email: sender, userId } },
    update: { categoryId: category.id },
    create: {
      email: sender,
      userId,
      categoryId: category.id,
    },
  });

  return {
    newCategory,
    newsletter,
  };
}

// TODO: what if user doesn't have all these categories set up?
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
      return { sender, category: defaultCategory.UNKNOWN.name };

    if (isNewsletterSender(sender))
      return { sender, category: defaultCategory.NEWSLETTER.name };

    if (isReceiptSender(sender))
      return { sender, category: defaultCategory.RECEIPT.name };

    return { sender, category: undefined };
  });
}

export async function getCategories(userId: string) {
  const categories = await getUserCategories(userId);
  if (categories.length === 0) return { error: "No categories found" };
  return { categories };
}

export async function categorizeWithAi({
  user,
  sendersWithSnippets,
  categories,
}: {
  user: UserEmailWithAI;
  sendersWithSnippets: Map<string, string[]>;
  categories: Pick<Category, "name" | "description">[];
}) {
  const categorizedSenders = preCategorizeSendersWithStaticRules(
    Array.from(sendersWithSnippets.keys()),
  );

  const sendersToCategorizeWithAi = categorizedSenders
    .filter((sender) => !sender.category)
    .map((sender) => sender.sender);

  logger.info("Found senders to categorize with AI", {
    count: sendersToCategorizeWithAi.length,
  });

  const aiResults = await aiCategorizeSenders({
    user,
    senders: sendersToCategorizeWithAi.map((sender) => ({
      emailAddress: sender,
      snippets: sendersWithSnippets.get(sender) || [],
    })),
    categories,
  });

  return [...categorizedSenders, ...aiResults];
}

async function categorizeUnknownSenders({
  unknownSenders,
  sendersMap,
  gmail,
  user,
  categories,
  userId,
}: {
  unknownSenders: Array<{ sender: string; category?: string }>;
  sendersMap: SenderMap;
  gmail: gmail_v1.Gmail;
  user: UserEmailWithAI;
  categories: Pick<Category, "id" | "name" | "description">[];
  userId: string;
}) {
  let categorizedCount = 0;

  for (const sender of unknownSenders) {
    const messages = sendersMap.get(sender.sender);
    let previousEmails =
      messages?.map((m) => m.snippet).filter(isDefined) || [];

    if (previousEmails.length === 0) {
      previousEmails = await getPreviousEmails(gmail, sender.sender);
    }

    const aiResult = await aiCategorizeSender({
      user,
      sender: sender.sender,
      previousEmails,
      categories,
    });

    if (aiResult) {
      await updateSenderCategory({
        sender: sender.sender,
        categories,
        categoryName: aiResult.category,
        userId,
      });
      categorizedCount++;
    }
  }

  return categorizedCount;
}

const isUnknownSender = (r: { category?: string }) =>
  !r.category ||
  r.category === defaultCategory.UNKNOWN.name ||
  r.category === REQUEST_MORE_INFORMATION_CATEGORY;
