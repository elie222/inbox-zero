import { NextResponse } from "next/server";
import {
  categorizeSendersBatchSchema,
  triggerCategorizeBatch,
} from "@/utils/categorize/senders/trigger-batch";
import { saveCategorizationProgress } from "@/utils/redis/categorization-progress";
import { categorizeSenders } from "@/utils/categorize/senders/categorize";
import { isActionError } from "@/utils/error";

export async function handleBatch(request: Request) {
  const json = await request.json();
  const body = categorizeSendersBatchSchema.parse(json);
  const { userId, pageToken, pageIndex } = body;

  console.log("categorizeSendersBatch", userId, pageIndex);

  // Process the batch
  const result = await categorizeSenders(userId, pageToken);
  if (isActionError(result)) return NextResponse.json(result);
  const { nextPageToken, categorizedCount } = result;

  const progress = await saveCategorizationProgress({
    userId,
    pageIndex: pageIndex + 1,
    incrementCategorized: categorizedCount || 0,
  });

  // Check if completed
  if (pageIndex >= progress.totalPages)
    return NextResponse.json({ status: "completed" });
  if (!nextPageToken) return NextResponse.json({ status: "completed" });

  await triggerCategorizeBatch({
    userId,
    pageToken: nextPageToken,
    pageIndex: pageIndex + 1,
  });

  return NextResponse.json({ status: "processing" });
}
