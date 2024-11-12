import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { withError } from "@/utils/middleware";
import { NextResponse } from "next/server";
import { categorizeSendersBatchSchema } from "@/app/api/user/categorize/senders/batch/trigger";
import { triggerCategorizeBatch } from "@/app/api/user/categorize/senders/batch/trigger";
import { categorizeSenders } from "@/utils/actions/categorize";

const MAX_PAGES = 50;

export const POST = withError(
  verifySignatureAppRouter(async (request: Request) => {
    const json = await request.json();
    const body = categorizeSendersBatchSchema.parse(json);
    const { userId, pageToken, pageIndex } = body;

    console.log("categorizeSendersBatch", userId, pageIndex);

    // Process the batch
    const { nextPageToken } = await categorizeSenders(userId, pageToken);

    // Check if completed
    if (pageIndex >= MAX_PAGES)
      return NextResponse.json({ status: "completed" });
    if (!nextPageToken) return NextResponse.json({ status: "completed" });

    await triggerCategorizeBatch({
      userId,
      pageToken: nextPageToken,
      pageIndex: pageIndex + 1,
    });

    return NextResponse.json({ status: "processing" });
  }),
);
