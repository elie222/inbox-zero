import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getUncategorizedSenders } from "@/app/api/user/categorize/senders/uncategorized/get-uncategorized-senders";

export type UncategorizedSendersResponse = {
  uncategorizedSenders: string[];
  nextOffset?: number;
};

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const url = new URL(request.url);
  const offset = Number.parseInt(url.searchParams.get("offset") || "0");

  const result = await getUncategorizedSenders({
    emailAccountId,
    offset,
  });

  return NextResponse.json(result);
});
