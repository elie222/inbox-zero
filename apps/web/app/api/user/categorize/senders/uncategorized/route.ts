import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { getSessionAndGmailClient } from "@/utils/actions/helpers";
import { isActionError } from "@/utils/error";
import { getUncategorizedSenders } from "@/app/api/user/categorize/senders/uncategorized/get-uncategorized-senders";

export type UncategorizedSendersResponse = {
  uncategorizedSenders: string[];
  nextOffset?: number;
};

export const GET = withError(async (request) => {
  const sessionResult = await getSessionAndGmailClient();
  if (isActionError(sessionResult))
    return NextResponse.json({ error: sessionResult.error });
  const { user } = sessionResult;

  const url = new URL(request.url);
  const offset = Number.parseInt(url.searchParams.get("offset") || "0");

  const result = await getUncategorizedSenders({
    userId: user.id,
    offset,
  });

  return NextResponse.json(result);
});
