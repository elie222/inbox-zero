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
import { getGmailClient } from "@/utils/gmail/client";
import { UNKNOWN_CATEGORY } from "@/utils/ai/categorize-sender/ai-categorize-senders";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("api/user/categorize/senders/batch");

export async function handleBatchRequest(
  request: Request,
): Promise<NextResponse> {
  const handleBatchResult = await handleBatch(request);
  if (isActionError(handleBatchResult))
    return NextResponse.json(handleBatchResult);
  return NextResponse.json({ ok: true });
}

async function handleBatch(request: Request) {
  const json = await request.json();
  const body = aiCategorizeSendersSchema.parse(json);
  const { userId, senders } = body;

  logger.trace("handleBatch", { userId, senders });

  const userResult = await validateUserAndAiAccess(userId);
  if (isActionError(userResult)) return userResult;
  const { user, accessToken } = userResult;

  const categoriesResult = await getCategories(userId);
  if (isActionError(categoriesResult)) return categoriesResult;
  const { categories } = categoriesResult;

  const gmail = getGmailClient({ accessToken });
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
