import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getTrainedSendersAcrossAccounts } from "@/utils/trained-senders";

export type TrainedSendersResponse = Awaited<
  ReturnType<typeof getTrainedSendersAcrossAccounts>
>;

export function parsePage(url: URL) {
  return Math.max(1, Number.parseInt(url.searchParams.get("page") || "1") || 1);
}

// One row per sender in this mailbox: the rules it is trained into (with the
// label each applies) and the rules it is excluded from. Newest first.
export const GET = withEmailAccount("user/trained-senders", async (request) => {
  const url = new URL(request.url);
  const result = await getTrainedSendersAcrossAccounts({
    emailAccountIds: [request.auth.emailAccountId],
    page: parsePage(url),
    query: url.searchParams.get("q")?.trim() ?? "",
  });
  return NextResponse.json(result);
});
