import { NextResponse } from "next/server";
import { aiCategorizeSendersSchema } from "@/app/api/user/categorize/senders/batch/handle-batch-validation";
import { getThreadsFromSender } from "@/utils/gmail/thread";
import {
  categorizeWithAi,
  getCategories,
  updateSenderCategory,
} from "@/utils/categorize/senders/categorize";
import { isDefined } from "@/utils/types";
import { isActionError } from "@/utils/error";
import { validateUserAndAiAccess } from "@/utils/user/validate";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { UNKNOWN_CATEGORY } from "@/utils/ai/categorize-sender/ai-categorize-senders";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("api/user/categorize/senders/batch");

export async function handleBatchRequest(
  request: Request,
): Promise<NextResponse> {
  try {
    const handleBatchResult = await handleBatchInternal(request);
    if (isActionError(handleBatchResult))
      return NextResponse.json({ error: handleBatchResult.error });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("handleBatchRequest", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

async function handleBatchInternal(request: Request) {
  const json = await request.json();
  const body = aiCategorizeSendersSchema.parse(json);
  const { userId, senders } = body;

  logger.trace(`handleBatch ${userId}: ${senders.length} senders`);

  const userResult = await validateUserAndAiAccess(userId);
  if (isActionError(userResult)) return userResult;
  const { user } = userResult;

  const categoriesResult = await getCategories(userId);
  if (isActionError(categoriesResult)) return categoriesResult;
  const { categories } = categoriesResult;

  const account = await prisma.account.findFirst({
    where: { user: { id: userId }, provider: "google" },
    select: {
      access_token: true,
      refresh_token: true,
      expires_at: true,
      providerAccountId: true,
    },
  });

  if (!account) return { error: "No account found" };
  if (!account.access_token || !account.refresh_token)
    return { error: "No access or refresh token" };

  const gmail = await getGmailClientWithRefresh(
    {
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
      expiryDate: account.expires_at,
    },
    account.providerAccountId,
  );
  if (!gmail) return { error: "No Gmail client" };

  const sendersWithSnippets: Map<string, string[]> = new Map();

  // 1. fetch 3 messages for each sender
  for (const sender of senders) {
    const threadsFromSender = await getThreadsFromSender(gmail, sender, 3);
    const snippets = threadsFromSender.map((t) => t.snippet).filter(isDefined);
    sendersWithSnippets.set(sender, snippets);
  }

  // 2. categorize senders with ai
  const results = await categorizeWithAi({
    user,
    sendersWithSnippets,
    categories,
  });

  // 3. save categorized senders to db
  for (const result of results) {
    await updateSenderCategory({
      sender: result.sender,
      categories,
      categoryName: result.category ?? UNKNOWN_CATEGORY,
      userId,
    });
  }

  return NextResponse.json({ ok: true });
}
