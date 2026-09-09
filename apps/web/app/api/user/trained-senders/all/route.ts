import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { getTrainedSendersAcrossAccounts } from "@/utils/trained-senders";
import { parsePage } from "@/app/api/user/trained-senders/route";

export type AllTrainedSendersResponse = Awaited<
  ReturnType<typeof getTrainedSendersAcrossAccounts>
> & { accounts: { id: string; email: string }[] };

// Every mailbox the user owns, optionally narrowed to an organization's
// members. Other people's mailboxes are never included: the row actions are
// account-scoped and would reject them anyway.
export const GET = withAuth("user/trained-senders/all", async (request) => {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");

  const accounts = await prisma.emailAccount.findMany({
    where: {
      userId: request.auth.userId,
      ...(organizationId ? { members: { some: { organizationId } } } : {}),
    },
    select: { id: true, email: true },
    orderBy: { email: "asc" },
  });

  const result = await getTrainedSendersAcrossAccounts({
    emailAccountIds: accounts.map((a) => a.id),
    page: parsePage(url),
    query: url.searchParams.get("q")?.trim() ?? "",
  });

  return NextResponse.json({ ...result, accounts });
});
