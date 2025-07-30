import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import {
  dateRangeSchema,
  type EmailActionsResponse,
} from "../validation";
import { validateApiKeyAndGetGmailClient } from "@/utils/api-auth";
import { getEmailAccountId } from "@/app/api/v1/helpers";
import { getEmailActionsByDay } from "@inboxzero/tinybird";

const logger = createScopedLogger("api/v1/stats/email-actions");

export const GET = withError(async (request) => {
  const { userId, accountId } = await validateApiKeyAndGetGmailClient(request);

  const { searchParams } = new URL(request.url);
  const queryResult = dateRangeSchema.safeParse(
    Object.fromEntries(searchParams),
  );

  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 },
    );
  }

  const emailAccountId = await getEmailAccountId({
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
    const { fromDate, toDate } = queryResult.data;

    // Get email actions from TinyBird
    const result = await getEmailActionsByDay({ 
      ownerEmail: emailAccountId,
      fromDate: fromDate ? new Date(fromDate).getTime() : undefined,
      toDate: toDate ? new Date(toDate).getTime() : undefined,
    });

    const response: EmailActionsResponse = {
      actions: result.data.map((d) => ({
        date: d.date,
        archived: d.archive_count,
        deleted: d.delete_count,
      })),
    };

    logger.info("Retrieved email actions stats", {
      userId,
      emailAccountId,
      count: response.actions.length,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error retrieving email actions stats", {
      userId,
      error,
    });
    return NextResponse.json(
      { error: "Failed to retrieve email actions stats" },
      { status: 500 },
    );
  }
});