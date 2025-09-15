import prisma from "@/utils/prisma";
import { aiCategorizeSenders } from "@/utils/ai/categorize-sender/ai-categorize-senders";
import { defaultCategory, type SenderCategory } from "@/utils/categories";
import { isNewsletterSender } from "@/utils/ai/group/find-newsletters";
import { isReceiptSender } from "@/utils/ai/group/find-receipts";
import { aiCategorizeSender } from "@/utils/ai/categorize-sender/ai-categorize-single-sender";
import type { Category } from "@prisma/client";
import { getUserCategories } from "@/utils/category.server";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import { extractEmailAddress } from "@/utils/email";
import { SafeError } from "@/utils/error";
import type { EmailProvider } from "@/utils/email/types";

const logger = createScopedLogger("categorize/senders");

export async function categorizeSender(
  senderAddress: string,
  emailAccount: EmailAccountWithAI,
  provider: EmailProvider,
  userCategories?: Pick<Category, "id" | "name" | "description">[],
) {
  const categories =
    userCategories ||
    (await getUserCategories({ emailAccountId: emailAccount.id }));
  if (categories.length === 0) return { categoryId: undefined };

  const previousEmails = await provider.getThreadsFromSenderWithSubject(
    senderAddress,
    3,
  );

  const aiResult = await aiCategorizeSender({
    emailAccount,
    sender: senderAddress,
    previousEmails,
    categories,
  });

  if (aiResult) {
    const { newsletter } = await updateSenderCategory({
      sender: senderAddress,
      categories,
      categoryName: aiResult.category,
      emailAccountId: emailAccount.id,
    });

    return { categoryId: newsletter.categoryId };
  }

  logger.error("No AI result for sender", {
    userEmail: emailAccount.email,
    senderAddress,
  });

  return { categoryId: undefined };
}

export async function updateSenderCategory({
  emailAccountId,
  sender,
  categories,
  categoryName,
}: {
  emailAccountId: string;
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
        emailAccountId,
        // color: getRandomColor(),
      },
    });
    category = newCategory;
  }

  // save category
  const newsletter = await prisma.newsletter.upsert({
    where: {
      email_emailAccountId: { email: sender, emailAccountId },
    },
    update: { categoryId: category.id },
    create: {
      email: sender,
      emailAccountId,
      categoryId: category.id,
    },
  });

  return {
    newCategory,
    newsletter,
  };
}

export async function updateCategoryForSender({
  emailAccountId,
  sender,
  categoryId,
}: {
  emailAccountId: string;
  sender: string;
  categoryId: string;
}) {
  const email = extractEmailAddress(sender);
  await prisma.newsletter.upsert({
    where: { email_emailAccountId: { email, emailAccountId } },
    update: { categoryId },
    create: {
      email,
      emailAccountId,
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

export async function getCategories({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const categories = await getUserCategories({ emailAccountId });
  if (categories.length === 0) throw new SafeError("No categories found");
  return { categories };
}

export async function categorizeWithAi({
  emailAccount,
  sendersWithEmails,
  categories,
}: {
  emailAccount: EmailAccountWithAI;
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
    userEmail: emailAccount.email,
    count: sendersToCategorizeWithAi.length,
  });

  const aiResults = await aiCategorizeSenders({
    emailAccount,
    senders: sendersToCategorizeWithAi.map((sender) => ({
      emailAddress: sender,
      emails: sendersWithEmails.get(sender) || [],
    })),
    categories,
  });

  return [...categorizedSenders, ...aiResults];
}
