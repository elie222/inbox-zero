import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { aiCategorizeSenders } from "@/utils/ai/categorize-sender/ai-categorize-senders";
import { defaultCategory, type SenderCategory } from "@/utils/categories";
import { isNewsletterSender } from "@/utils/ai/group/find-newsletters";
import { isReceiptSender } from "@/utils/ai/group/find-receipts";
import { aiCategorizeSender } from "@/utils/ai/categorize-sender/ai-categorize-single-sender";
import { getThreadsFromSenderWithSubject } from "@/utils/gmail/thread";
import type { Category } from "@prisma/client";
import { getUserCategories } from "@/utils/category.server";
import type { User } from "@prisma/client";
import type { UserEmailWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("categorize/senders");

export async function categorizeSender(
  senderAddress: string,
  user: Pick<User, "id"> & UserEmailWithAI,
  gmail: gmail_v1.Gmail,
  accessToken: string,
  userCategories?: Pick<Category, "id" | "name" | "description">[],
) {
  const categories = userCategories || (await getUserCategories(user.id));
  if (categories.length === 0) return { categoryId: undefined };

  const previousEmails = await getThreadsFromSenderWithSubject(
    gmail,
    accessToken,
    senderAddress,
    3,
  );

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

  logger.error("No AI result for sender", {
    userEmail: user.email,
    senderAddress,
  });

  return { categoryId: undefined };
}

export async function updateSenderCategory({
  userId,
  sender,
  categories,
  categoryName,
}: {
  userId: string;
  sender: string;
  categories: Pick<Category, "id" | "name">[];
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

export async function updateCategoryForSender({
  userId,
  sender,
  categoryId,
}: {
  userId: string;
  sender: string;
  categoryId: string;
}) {
  await prisma.newsletter.upsert({
    where: { email_userId: { email: sender, userId } },
    update: { categoryId },
    create: {
      email: sender,
      userId,
      categoryId,
    },
  });
}

// TODO: what if user doesn't have all these categories set up?
// Use static rules to categorize senders if we can, before sending to LLM
function preCategorizeSendersWithStaticRules(
  senders: string[],
): { sender: string; category: SenderCategory | undefined }[] {
  return senders.map((sender) => {
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
  sendersWithEmails,
  categories,
}: {
  user: UserEmailWithAI;
  sendersWithEmails: Map<string, { subject: string; snippet: string }[]>;
  categories: Pick<Category, "name" | "description">[];
}) {
  const categorizedSenders = preCategorizeSendersWithStaticRules(
    Array.from(sendersWithEmails.keys()),
  );

  const sendersToCategorizeWithAi = categorizedSenders
    .filter((sender) => !sender.category)
    .map((sender) => sender.sender);

  logger.info("Found senders to categorize with AI", {
    userEmail: user.email,
    count: sendersToCategorizeWithAi.length,
  });

  const aiResults = await aiCategorizeSenders({
    user,
    senders: sendersToCategorizeWithAi.map((sender) => ({
      emailAddress: sender,
      emails: sendersWithEmails.get(sender) || [],
    })),
    categories,
  });

  return [...categorizedSenders, ...aiResults];
}
