import { z } from "zod";
import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getGraphClientAndAccessTokenForEmail } from "@/utils/account"; // You need to implement this
import { Client } from "@microsoft/microsoft-graph-client";

export type GetThreadsResponse = Awaited<ReturnType<typeof getGetThreads>>;
const getThreadsQuery = z.object({
  from: z.string(),
  labelId: z.string().nullish(),
});
type GetThreadsQuery = z.infer<typeof getThreadsQuery>;

async function getGetThreads(
  { from, labelId }: GetThreadsQuery,
  graphClient: Client,
) {
  let filter = `from/emailAddress/address eq '${from}'`;
  if (labelId) {
    //labelId could be a category or folderId
    filter += ` and categories/any(c:c eq '${labelId}')`;
  }

  const response = await graphClient
    .api("/me/messages")
    .filter(filter)
    .top(500)
    .get();

  return response.value || [];
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  if (!emailAccountId) {
    return NextResponse.json(
      { error: "Email account not found" },
      { status: 404 },
    );
  }

  const graphClient = await getGraphClientAndAccessTokenForEmail({
    emailAccountId,
  });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const labelId = searchParams.get("labelId");
  const query = getThreadsQuery.parse({ from, labelId });

  const result = await getGetThreads(query, graphClient);

  return NextResponse.json(result);
});
