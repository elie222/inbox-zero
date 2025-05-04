import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import {
  replyTrackerQuerySchema,
  type ReplyTrackerResponse,
} from "./validation";
import { validateApiKeyAndGetGmailClient } from "@/utils/api-auth";
import { ThreadTrackerType } from "@prisma/client";
import { getPaginatedThreadTrackers } from "@/app/(app)/[emailAccountId]/reply-zero/fetch-trackers";
import { getThreadsBatchAndParse } from "@/utils/gmail/thread";
import { isDefined } from "@/utils/types";
import { getEmailAccountId } from "@/app/api/v1/helpers";

const logger = createScopedLogger("api/v1/reply-tracker");

export const GET = withError(async (request) => {
  const { accessToken, userId, accountId } =
    await validateApiKeyAndGetGmailClient(request);

  const { searchParams } = new URL(request.url);
  const queryResult = replyTrackerQuerySchema.safeParse(
    Object.fromEntries(searchParams),
  );

  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 },
    );
  }

  const emailAccountId = await getEmailAccountId({
    email: queryResult.data.email,
    accountId,
    userId,
  });

  if (!emailAccountId) {
    return NextResponse.json(
      { error: "Email account not found" },
      { status: 400 },
    );
  }

  try {
    function getType(type: "needs-reply" | "needs-follow-up") {
      if (type === "needs-reply") return ThreadTrackerType.NEEDS_REPLY;
      if (type === "needs-follow-up") return ThreadTrackerType.AWAITING;
      throw new Error("Invalid type");
    }

    const { trackers, count } = await getPaginatedThreadTrackers({
      emailAccountId,
      type: getType(queryResult.data.type),
      page: queryResult.data.page,
      timeRange: queryResult.data.timeRange,
    });

    const threads = await getThreadsBatchAndParse(
      trackers.map((tracker) => tracker.threadId),
      accessToken,
      false,
    );

    const response: ReplyTrackerResponse = {
      emails: threads.threads
        .map((thread) => {
          const lastMessage = thread.messages[thread.messages.length - 1];
          if (!lastMessage) return null;
          return {
            threadId: thread.id,
            subject: lastMessage.headers.subject,
            from: lastMessage.headers.from,
            date: lastMessage.headers.date,
            snippet: lastMessage.snippet,
          };
        })
        .filter(isDefined),
      count,
    };

    logger.info("Retrieved emails needing reply", {
      userId,
      count: response.emails.length,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error retrieving emails needing reply", {
      userId,
      error,
    });
    return NextResponse.json(
      { error: "Failed to retrieve emails" },
      { status: 500 },
    );
  }
});
