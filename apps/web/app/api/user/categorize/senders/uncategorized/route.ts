import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getUncategorizedSenders } from "@/app/api/user/categorize/senders/uncategorized/get-uncategorized-senders";

export type UncategorizedSendersResponse = {
  uncategorizedSenders: string[];
  nextOffset?: number;
};

export const GET = withAuth(async (request) => {
  const { userEmail } = request.auth;

  const url = new URL(request.url);
  const offset = Number.parseInt(url.searchParams.get("offset") || "0");

  const result = await getUncategorizedSenders({
    emailAccountId: userEmail,
    offset,
  });

  return NextResponse.json(result);
});
