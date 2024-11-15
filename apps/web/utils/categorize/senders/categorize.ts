import { revalidatePath } from "next/cache";
import uniq from "lodash/uniq";
import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import {
  aiCategorizeSenders,
  REQUEST_MORE_INFORMATION_CATEGORY,
} from "@/utils/ai/categorize-sender/ai-categorize-senders";
import { findSenders } from "@/app/api/user/categorize/senders/find-senders";
import { defaultCategory, type SenderCategory } from "@/utils/categories";
import { isNewsletterSender } from "@/utils/ai/group/find-newsletters";
import { isReceiptSender } from "@/utils/ai/group/find-receipts";
import { aiCategorizeSender } from "@/utils/ai/categorize-sender/ai-categorize-single-sender";
import { getThreadsFromSender } from "@/utils/gmail/thread";
import { isDefined } from "@/utils/types";
import type { Category } from "@prisma/client";
import { getUserCategories } from "@/utils/category.server";
import { getGmailClient } from "@/utils/gmail/client";
import type { User } from "@prisma/client";
import type { UserAIFields, UserEmailWithAI } from "@/utils/llms/types";
import { type ActionError, isActionError } from "@/utils/error";
import { validateUserAndAiAccess } from "@/utils/user/validate";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("categorize/senders");

export async function categorizeSenders(
  userId: string,
  pageToken?: string,
): Promise<
  | {
      categorizedCount: number;
      nextPageToken?: string | null;
    }
  | ActionError
> {
  logger.info("categorizeSendersAction", userId, pageToken);

  const userResult = await validateUserAndAiAccess(userId);
  if (isActionError(userResult)) return userResult;
  const { user, accessToken } = userResult;

  // Get Gmail client and find senders
  const gmail = getGmailClient({ accessToken });
  const { senders, sendersResult } = await findAndPrepareSenders(
    gmail,
    accessToken,
    pageToken,
  );

  // Get categories and existing senders
  const categoriesResult = await validateCategories(userId);
  if (isActionError(categoriesResult)) return categoriesResult;
  const { categories } = categoriesResult;

  const existingSenders = await getExistingSenders(senders, userId);

  // First pass: Categorize new senders
  const { results, categorizedCount: initialCount } =
    await categorizeNewSenders({
      senders,
      existingSenders,
      sendersResult,
      user,
      categories,
      userId,
    });

  // Second pass: Re-categorize unknown senders
  const unknownSenders = [
    ...results,
    ...existingSenders.map((s) => ({
      sender: s.email,
      category: s.category?.name,
    })),
  ].filter(isUnknownSender);

  const unknownCount = await categorizeUnknownSenders({
    unknownSenders,
    sendersResult,
    gmail,
    user,
    categories,
    userId,
  });

  revalidatePath("/smart-categories");
  return {
    nextPageToken: sendersResult.nextPageToken,
    categorizedCount: initialCount + unknownCount,
  };
}

async function findAndPrepareSenders(
  gmail: gmail_v1.Gmail,
  accessToken: string,
  pageToken?: string,
) {
  const sendersResult = await findSenders(gmail, accessToken, 20, pageToken);
  logger.info(`Found ${sendersResult.senders.size} senders`);

  const senders = uniq(Array.from(sendersResult.senders.keys()));
  logger.info(`Found ${senders.length} unique senders`);

  return { senders, sendersResult };
}

async function getExistingSenders(senders: string[], userId: string) {
  return prisma.newsletter.findMany({
    where: { email: { in: senders }, userId },
    select: {
      email: true,
      category: { select: { name: true, description: true } },
    },
  });
}

async function categorizeNewSenders({
  senders,
  existingSenders,
  sendersResult,
  user,
  categories,
  userId,
}: {
  senders: string[];
  existingSenders: { email: string }[];
  sendersResult: { senders: Map<string, any[]> };
  user: UserEmailWithAI;
  categories: Pick<Category, "id" | "name" | "description">[];
  userId: string;
}): Promise<{
  results: { sender: string; category?: string }[];
  categorizedCount: number;
}> {
  const sendersToCategorize = senders.filter(
    (sender) => !existingSenders.some((s) => s.email === sender),
  );

  const sendersWithSnippets = new Map(
    sendersToCategorize.map((sender) => [
      sender,
      sendersResult.senders
        .get(sender)
        ?.map((m) => m.snippet)
        .filter(isDefined) || [],
    ]),
  );

  const results = await categorizeWithAi({
    senders: sendersToCategorize,
    user,
    sendersWithSnippets,
    categories,
  });

  let categorizedCount = 0;
  for (const result of results) {
    await saveResult(result, categories, userId);
    categorizedCount++;
  }

  return { results, categorizedCount };
}

export async function fastCategorizeSenders(
  senderAddresses: string[],
  userId: string,
  gmail: gmail_v1.Gmail,
) {
  const userResult = await validateUserAndAiAccess(userId);
  if (isActionError(userResult)) return userResult;

  const categoriesResult = await validateCategories(userId);
  if (isActionError(categoriesResult)) return categoriesResult;

  const senders = uniq(senderAddresses);
  logger.info(`Found ${senders.length} unique senders`);

  // fetch snippets for each sender
  const sendersWithSnippets: Map<string, string[]> = new Map();
  for (const sender of senders) {
    const previousEmails = await getPreviousEmails(gmail, sender);
    sendersWithSnippets.set(sender, previousEmails);
  }

  const results = await categorizeWithAi({
    senders,
    user: userResult.user,
    sendersWithSnippets,
    categories: categoriesResult.categories,
  });

  // Save results and return
  const categorizedResults: Record<string, string | undefined> = {};
  for (const result of results) {
    categorizedResults[result.sender] = result.category;
    await saveResult(result, categoriesResult.categories, userId);
  }

  revalidatePath("/smart-categories");
  return { results: categorizedResults };
}

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

async function saveResult(
  result: { sender: string; category?: string },
  categories: Pick<Category, "id" | "name" | "description">[],
  userId: string,
) {
  if (!result.category) return;
  const { newCategory } = await updateSenderCategory({
    sender: result.sender,
    categories,
    categoryName: result.category,
    userId,
  });
  if (newCategory) categories.push(newCategory);
  // TODO: what is categories used for?
}

async function getPreviousEmails(gmail: gmail_v1.Gmail, sender: string) {
  const threadsFromSender = await getThreadsFromSender(gmail, sender, 3);

  const previousEmails = threadsFromSender
    .map((t) => t?.snippet)
    .filter(isDefined);

  return previousEmails;
}

async function updateSenderCategory({
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

async function validateCategories(userId: string) {
  const categories = await getUserCategories(userId);
  if (categories.length === 0) return { error: "No categories found" };
  return { categories };
}

async function categorizeWithAi({
  senders,
  user,
  sendersWithSnippets,
  categories,
}: {
  senders: string[];
  user: UserEmailWithAI;
  sendersWithSnippets: Map<string, string[]>;
  categories: Pick<Category, "name" | "description">[];
}) {
  const categorizedSenders = preCategorizeSendersWithStaticRules(senders);

  const sendersToCategorizeWithAi = categorizedSenders
    .filter((sender) => !sender.category)
    .map((sender) => sender.sender);

  console.log(
    `Found ${sendersToCategorizeWithAi.length} senders to categorize with AI`,
  );

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
  sendersResult,
  gmail,
  user,
  categories,
  userId,
}: {
  unknownSenders: Array<{ sender: string; category?: string }>;
  sendersResult: { senders: Map<string, any[]> };
  gmail: gmail_v1.Gmail;
  user: UserEmailWithAI;
  categories: Pick<Category, "id" | "name" | "description">[];
  userId: string;
}) {
  let categorizedCount = 0;

  for (const sender of unknownSenders) {
    const messages = sendersResult.senders.get(sender.sender);
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
      await saveResult(
        {
          sender: sender.sender,
          category: aiResult.category,
        },
        categories,
        userId,
      );
      categorizedCount++;
    }
  }

  return categorizedCount;
}

const isUnknownSender = (r: { category?: string }) =>
  !r.category ||
  r.category === defaultCategory.UNKNOWN.name ||
  r.category === REQUEST_MORE_INFORMATION_CATEGORY;
