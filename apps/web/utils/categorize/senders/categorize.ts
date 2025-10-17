import prisma from "@/utils/prisma";
import { aiCategorizeSenders } from "@/utils/ai/categorize-sender/ai-categorize-senders";
import { defaultCategory, type SenderCategory } from "@/utils/categories";
import { isNewsletterSender } from "@/utils/ai/group/find-newsletters";
import { isReceiptSender } from "@/utils/ai/group/find-receipts";
import { aiCategorizeSender } from "@/utils/ai/categorize-sender/ai-categorize-single-sender";
import type { Category } from "@prisma/client";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import { extractEmailAddress } from "@/utils/email";
import type { EmailProvider } from "@/utils/email/types";
import { priorityToNumber, type PriorityLevel } from "@/utils/priority";
import { getUserCategories } from "@/utils/category.server";

const logger = createScopedLogger("categorize/senders");

export async function categorizeSender(
  senderAddress: string,
  emailAccount: EmailAccountWithAI,
  provider: EmailProvider,
) {
  const categories = await getUserCategories({
    emailAccountId: emailAccount.id,
  });

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
      priority: aiResult.priority,
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
  priority,
}: {
  emailAccountId: string;
  sender: string;
  categories: Pick<Category, "id" | "name">[];
  categoryName: string;
  priority?: PriorityLevel;
}) {
  // Check if category exists in the provided categories array first
  let category = categories.find((c) => c.name === categoryName);
  let newCategory: Category | undefined;

  if (!category) {
    // Category doesn't exist in provided categories, upsert it in the database
    const defaultCategoryMatch = Object.values(defaultCategory).find(
      (c) => c.name === categoryName,
    );

    const upsertedCategory = await prisma.category.upsert({
      where: {
        name_emailAccountId: {
          name: categoryName,
          emailAccountId,
        },
      },
      update: {}, // No updates needed since we're just ensuring it exists
      create: {
        name: categoryName,
        description: defaultCategoryMatch?.description,
        emailAccountId,
      },
    });

    category = upsertedCategory;
    // Check if this was a newly created category
    if (!categories.some((c) => c.id === upsertedCategory.id)) {
      newCategory = upsertedCategory;
    }
  }

  // save category
  const priorityNumber = priority ? priorityToNumber(priority) : null;
  const newsletter = await prisma.newsletter.upsert({
    where: {
      email_emailAccountId: { email: sender, emailAccountId },
    },
    update: {
      categoryId: category.id,
      priority: priorityNumber,
    },
    create: {
      email: sender,
      emailAccountId,
      categoryId: category.id,
      priority: priorityNumber,
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

export async function getCategories() {
  // Use default categories instead of requiring user-created categories
  const defaultCategories = Object.values(defaultCategory)
    .filter((category) => category.enabled)
    .map((category) => ({
      id: category.name, // Use name as id for default categories
      name: category.name,
      description: category.description,
    }));

  return { categories: defaultCategories };
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
