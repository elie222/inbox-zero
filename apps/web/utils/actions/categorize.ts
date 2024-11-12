"use server";

import { revalidatePath } from "next/cache";
import uniq from "lodash/uniq";
import type { gmail_v1 } from "@googleapis/gmail";
import { categorize } from "@/app/api/ai/categorize/controller";
import {
  type CategorizeBodyWithHtml,
  categorizeBodyWithHtml,
} from "@/app/api/ai/categorize/validation";
import {
  type CreateCategoryBody,
  createCategoryBody,
} from "@/utils/actions/validation";
import { getSessionAndGmailClient } from "@/utils/actions/helpers";
import { hasPreviousEmailsFromSender } from "@/utils/gmail/message";
import { emailToContent } from "@/utils/mail";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";
import { truncate } from "@/utils/string";
import prisma, { isDuplicateError } from "@/utils/prisma";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import {
  aiCategorizeSenders,
  REQUEST_MORE_INFORMATION_CATEGORY,
} from "@/utils/ai/categorize-sender/ai-categorize-senders";
import { findSenders } from "@/app/api/user/categorize/senders/find-senders";
import { defaultCategory, type SenderCategory } from "@/utils/categories";
import { isNewsletterSender } from "@/utils/ai/group/find-newsletters";
import { isReceiptSender } from "@/utils/ai/group/find-receipts";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { aiCategorizeSender } from "@/utils/ai/categorize-sender/ai-categorize-single-sender";
import { getThreadsFromSender } from "@/utils/gmail/thread";
import { isDefined } from "@/utils/types";
import type { Category, User } from "@prisma/client";
import type { UserAIFields } from "@/utils/llms/types";
import { getUserCategories } from "@/utils/category.server";
import { hasAiAccess } from "@/utils/premium";
import { triggerCategorizeBatch } from "@/app/api/user/categorize/senders/batch/trigger";
import { getGmailClient } from "@/utils/gmail/client";

export const categorizeEmailAction = withActionInstrumentation(
  "categorizeEmail",
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

async function saveResult(
  result: { sender: string; category?: string },
  categories: { id: string; name: string }[],
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
}

export async function categorizeSenders(userId: string, pageToken?: string) {
  console.log("categorizeSendersAction", userId, pageToken);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
      premium: { select: { aiAutomationAccess: true } },
      accounts: { select: { access_token: true } },
    },
  });
  if (!user) return { error: "User not found" };

  const userHasAiAccess = hasAiAccess(
    user.premium?.aiAutomationAccess,
    user.aiApiKey,
  );
  if (!userHasAiAccess) return { error: "Please upgrade for AI access" };

  const accessToken = user.accounts[0].access_token;
  if (!accessToken) return { error: "No access token" };

  const gmail = getGmailClient({ accessToken });

  const sendersResult = await findSenders(gmail, accessToken, 20, pageToken);

  console.log(`Found ${sendersResult.senders.size} senders`);

  const senders = uniq(Array.from(sendersResult.senders.keys()));

  console.log(`Found ${senders.length} unique senders`);

  // remove senders we've already categorized
  const [existingSenders, categories] = await Promise.all([
    prisma.newsletter.findMany({
      where: { email: { in: senders }, userId },
      select: {
        email: true,
        category: { select: { name: true, description: true } },
      },
    }),
    getUserCategories(userId),
  ]);

  if (categories.length === 0) return { error: "No categories found" };

  const sendersToCategorize = senders.filter(
    (sender) => !existingSenders.some((s) => s.email === sender),
  );

  const categorizedSenders =
    preCategorizeSendersWithStaticRules(sendersToCategorize);

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
      snippets: sendersResult.senders.get(sender)?.map((m) => m.snippet) || [],
    })),
    categories,
  });

  let categorizedCount = 0;
  const results = [...categorizedSenders, ...aiResults];

  for (const result of results) {
    await saveResult(result, categories, userId);
    categorizedCount++;
  }

  // categorize unknown senders
  // TODO: this will take a while. so probably break this out, or stream results as they come in
  const unknownSenders = [
    ...results,
    ...existingSenders.map((s) => ({
      sender: s.email,
      category: s.category?.name,
    })),
  ].filter(
    (r) =>
      !r.category ||
      r.category === defaultCategory.UNKNOWN.name ||
      r.category === REQUEST_MORE_INFORMATION_CATEGORY,
  );

  console.log(
    `Found ${unknownSenders.length} unknown senders to categorize with AI`,
  );

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

  revalidatePath("/smart-categories");

  return { nextPageToken: sendersResult.nextPageToken, categorizedCount };
}

export const bulkCategorizeSendersAction = withActionInstrumentation(
  "bulkCategorizeSenders",
  async () => {
    const { gmail, user: u, error, session } = await getSessionAndGmailClient();
    if (error) return { error };
    if (!gmail) return { error: "Could not load Gmail" };
    if (!session?.accessToken) return { error: "No access token" };

    const user = await prisma.user.findUnique({
      where: { id: u.id },
      select: {
        email: true,
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
        premium: { select: { aiAutomationAccess: true } },
        accounts: { select: { access_token: true } },
      },
    });
    if (!user) return { error: "User not found" };

    const userHasAiAccess = hasAiAccess(
      user.premium?.aiAutomationAccess,
      user.aiApiKey,
    );
    if (!userHasAiAccess) return { error: "Please upgrade for AI access" };

    const accessToken = user.accounts[0].access_token;
    if (!accessToken) return { error: "No access token" };

    await triggerCategorizeBatch({
      userId: session.user.id,
      pageIndex: 0,
    });
  },
);

export const fastCategorizeSendersAction = withActionInstrumentation(
  "fastCategorizeSenders",
  async (senderAddresses: string[]) => {
    console.log("fastCategorizeSendersAction");

    const { gmail, user: u, error, session } = await getSessionAndGmailClient();
    if (error) return { error };
    if (!gmail) return { error: "Could not load Gmail" };
    if (!session?.accessToken) return { error: "No access token" };

    const user = await prisma.user.findUnique({
      where: { id: u.id },
      select: {
        email: true,
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
        premium: { select: { aiAutomationAccess: true } },
      },
    });
    if (!user) return { error: "User not found" };

    // check if user has AI access
    const userHasAiAccess = hasAiAccess(
      user.premium?.aiAutomationAccess,
      user.aiApiKey,
    );
    if (!userHasAiAccess) return { error: "Please upgrade for AI access" };

    const senders = uniq(senderAddresses);

    console.log(`Found ${senders.length} unique senders`);

    const categories = await getUserCategories(u.id);

    if (categories.length === 0) return { error: "No categories found" };

    // pre-categorize senders with static rules
    const categorizedSenders = preCategorizeSendersWithStaticRules(senders);

    const sendersToCategorizeWithAi = categorizedSenders
      .filter((sender) => !sender.category)
      .map((sender) => sender.sender);

    console.log(
      `Found ${sendersToCategorizeWithAi.length} senders to categorize with AI`,
    );

    // fetch snippets for each sender
    const sendersWithSnippets: Map<string, string[]> = new Map();

    for (const sender of sendersToCategorizeWithAi) {
      const previousEmails = await getPreviousEmails(gmail, sender);
      sendersWithSnippets.set(sender, previousEmails);
    }

    // categorize senders with AI
    const aiResults = await aiCategorizeSenders({
      user,
      senders: sendersToCategorizeWithAi.map((sender) => ({
        emailAddress: sender,
        snippets: sendersWithSnippets.get(sender) || [],
      })),
      categories,
    });

    const results: Record<string, string | undefined> = {};

    for (const result of [...categorizedSenders, ...aiResults]) {
      results[result.sender] = result.category;
    }

    for (const [sender, category] of Object.entries(results)) {
      await saveResult({ sender, category }, categories, u.id);
    }

    revalidatePath("/smart-categories");

    console.log("results", JSON.stringify(results, null, 2));

    return { results };
  },
);

export const categorizeSenderAction = withActionInstrumentation(
  "categorizeSender",
  async (senderAddress: string) => {
    console.log("categorizeSenderAction");

    const { gmail, user: u, error, session } = await getSessionAndGmailClient();
    if (error) return { error };
    if (!gmail) return { error: "Could not load Gmail" };
    if (!session?.accessToken) return { error: "No access token" };

    const user = await prisma.user.findUnique({
      where: { id: u.id },
      select: {
        id: true,
        email: true,
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
        premium: { select: { aiAutomationAccess: true } },
      },
    });

    if (!user) return { error: "User not found" };

    const userHasAiAccess = hasAiAccess(
      user.premium?.aiAutomationAccess,
      user.aiApiKey,
    );

    if (!userHasAiAccess) return { error: "Please upgrade for AI access" };

    const result = await categorizeSender(
      senderAddress,
      user,
      gmail,
      session.accessToken!,
    );

    revalidatePath("/smart-categories");

    return result;
  },
);

export async function categorizeSender(
  senderAddress: string,
  user: Pick<User, "id" | "email"> & UserAIFields,
  gmail: gmail_v1.Gmail,
  accessToken: string,
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
  console.error(`No AI result for sender: ${senderAddress}`);

  return { categoryId: undefined };
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

export const changeSenderCategoryAction = withActionInstrumentation(
  "changeSenderCategory",
  async ({ sender, categoryId }: { sender: string; categoryId: string }) => {
    const session = await auth();
    if (!session?.user) return { error: "Not authenticated" };

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

export const upsertDefaultCategoriesAction = withActionInstrumentation(
  "upsertDefaultCategories",
  async (categories: { id?: string; name: string; enabled: boolean }[]) => {
    const session = await auth();
    if (!session?.user) return { error: "Not authenticated" };

    for (const { id, name, enabled } of categories) {
      const description = Object.values(defaultCategory).find(
        (c) => c.name === name,
      )?.description;

      if (enabled) {
        await upsertCategory(session.user.id, { name, description });
      } else {
        if (id) await deleteCategory(session.user.id, id);
      }
    }

    revalidatePath("/smart-categories");
  },
);

export const createCategoryAction = withActionInstrumentation(
  "createCategory",
  async (unsafeData: CreateCategoryBody) => {
    const session = await auth();
    if (!session?.user) return { error: "Not authenticated" };

    const { success, data, error } = createCategoryBody.safeParse(unsafeData);
    if (!success) return { error: error.message };

    await upsertCategory(session.user.id, data);

    revalidatePath("/smart-categories");
  },
);

export const deleteCategoryAction = withActionInstrumentation(
  "deleteCategory",
  async (categoryId: string) => {
    const session = await auth();
    if (!session?.user) return { error: "Not authenticated" };

    await deleteCategory(session.user.id, categoryId);

    revalidatePath("/smart-categories");
  },
);

async function deleteCategory(userId: string, categoryId: string) {
  await prisma.category.delete({ where: { id: categoryId, userId } });
}

async function upsertCategory(userId: string, newCategory: CreateCategoryBody) {
  try {
    if (newCategory.id) {
      const category = await prisma.category.update({
        where: { id: newCategory.id, userId },
        data: {
          name: newCategory.name,
          description: newCategory.description,
        },
      });

      return { id: category.id };
    } else {
      const category = await prisma.category.create({
        data: {
          userId,
          name: newCategory.name,
          description: newCategory.description,
        },
      });

      return { id: category.id };
    }
  } catch (error) {
    if (isDuplicateError(error, "name"))
      return { error: "Category with this name already exists" };

    throw error;
  }
}

export const setAutoCategorizeAction = withActionInstrumentation(
  "setAutoCategorize",
  async (autoCategorizeSenders: boolean) => {
    const session = await auth();
    if (!session?.user) return { error: "Not authenticated" };

    await prisma.user.update({
      where: { id: session.user.id },
      data: { autoCategorizeSenders },
    });

    return { autoCategorizeSenders };
  },
);
