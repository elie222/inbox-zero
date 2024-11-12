import { headers } from "next/headers";
import { withError } from "@/utils/middleware";
import { NextResponse } from "next/server";
import { sleep } from "@/utils/sleep";
import {
  INTERNAL_API_KEY_HEADER,
  isValidInternalApiKey,
} from "@/utils/internal-api";
import { categorizeSendersBatchSchema } from "@/app/api/user/categorize/senders/batch/trigger";
import { triggerCategorizeBatch } from "@/app/api/user/categorize/senders/batch/trigger";
import { categorizeSenders } from "@/utils/actions/categorize";

const MAX_PAGES = 50;

export const POST = withError(async (request: Request) => {
  const headersList = headers();
  const apiKey = headersList.get(INTERNAL_API_KEY_HEADER);

  if (!isValidInternalApiKey(apiKey))
    return new NextResponse("Unauthorized", { status: 401 });

  const json = await request.json();
  const body = categorizeSendersBatchSchema.parse(json);
  const { userId, pageToken, pageIndex } = body;

  console.log("categorizeSendersBatch", userId, pageIndex);

  // Process the batch
  const { nextPageToken } = await categorizeSenders(userId, pageToken);

  // Check if completed
  if (pageIndex >= MAX_PAGES) return NextResponse.json({ status: "completed" });
  if (!nextPageToken) return NextResponse.json({ status: "completed" });

  // Do not await this, so we can return early
  triggerCategorizeBatch({
    userId,
    pageToken: nextPageToken,
    pageIndex: pageIndex + 1,
  });

  // Make sure the next batch API request is triggered
  await sleep(100);

  return NextResponse.json({ status: "processing" });
});
