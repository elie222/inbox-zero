import { NextResponse } from "next/server";
import { aiCategorizeSendersSchema } from "@/app/api/user/categorize/senders/batch/handle-batch-validation";
import {
  categorizeWithAi,
  getCategories,
  updateSenderCategory,
} from "@/utils/categorize/senders/categorize";
import { validateUserAndAiAccess } from "@/utils/user/validate";
import { UNKNOWN_CATEGORY } from "@/utils/ai/categorize-sender/ai-categorize-senders";
import prisma from "@/utils/prisma";
import { saveCategorizationProgress } from "@/utils/redis/categorization-progress";
import { SafeError } from "@/utils/error";
import type { RequestWithLogger } from "@/utils/middleware";
import { createEmailProvider } from "@/utils/email/provider";

export async function handleBatchRequest(
  request: RequestWithLogger,
): Promise<NextResponse> {
  try {
    await handleBatchInternal(request);
    return NextResponse.json({ ok: true });
  } catch (error) {
    request.logger.error("Handle batch request error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

async function handleBatchInternal(request: RequestWithLogger) {
  const json = await request.json();
  const body = aiCategorizeSendersSchema.parse(json);
  const { emailAccountId, senders } = body;

  request.logger.info("Handle batch request", { senders: senders.length });

  const userResult = await validateUserAndAiAccess({ emailAccountId });
  const { emailAccount } = userResult;

  const categoriesResult = await getCategories({ emailAccountId });
  const { categories } = categoriesResult;

  const emailAccountWithAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: {
          provider: true,
        },
      },
    },
  });

  const account = emailAccountWithAccount?.account;

  if (!account) throw new SafeError("No account found");

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider: account.provider,
    logger: request.logger,
  });

  const sendersWithEmails: Map<string, { subject: string; snippet: string }[]> =
    new Map();

  // 1. fetch 3 messages for each sender
  for (const sender of senders) {
    const threadsFromSender =
      await emailProvider.getThreadsFromSenderWithSubject(sender, 3);
    sendersWithEmails.set(sender, threadsFromSender);
  }

  // 2. categorize senders with ai
  const results = await categorizeWithAi({
    emailAccount: {
      ...emailAccount,
      account: { provider: account.provider },
    },
    sendersWithEmails,
    categories,
  });

  // 3. save categorized senders to db
  for (const result of results) {
    await updateSenderCategory({
      sender: result.sender,
      categories,
      categoryName: result.category ?? UNKNOWN_CATEGORY,
      emailAccountId,
    });
  }

  // // 4. categorize senders that were not categorized
  // const uncategorizedSenders = results.filter(isUncategorized);

  // await saveCategorizationProgress({
  //   userId,
  //   incrementCompleted: senders.length - uncategorizedSenders.length,
  // });

  // for (const sender of uncategorizedSenders) {
  //   try {
  //     await categorizeSender(sender.sender, user, gmail, categories);
  //   } catch (error) {
  //     logger.error("Error categorizing sender", {
  //       sender: sender.sender,
  //       error,
  //     });
  //     captureException(error);
  //   }

  //   await saveCategorizationProgress({
  //     userId,
  //     incrementCompleted: 1,
  //   });
  // }

  await saveCategorizationProgress({
    emailAccountId,
    incrementCompleted: senders.length,
  });

  return NextResponse.json({ ok: true });
}

// const isUncategorized = (r: { category?: string }) =>
//   !r.category ||
//   r.category === UNKNOWN_CATEGORY ||
//   r.category === REQUEST_MORE_INFORMATION_CATEGORY;
