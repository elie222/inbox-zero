import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getOutlookFolders } from "@/utils/outlook/folders";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { getOutlookClientForEmail } from "@/utils/account";

export type GetFoldersResponse = Awaited<ReturnType<typeof getFolders>>;

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;

  const result = await getFolders({ emailAccountId });
  return NextResponse.json(result);
});

async function getFolders({ emailAccountId }: { emailAccountId: string }) {
  const emailAccount = await getEmailAccountWithAiAndTokens({ emailAccountId });

  if (emailAccount?.account?.provider === "microsoft") {
    const outlook = await getOutlookClientForEmail({ emailAccountId });
    return getOutlookFolders(outlook);
  }

  return [];
}
