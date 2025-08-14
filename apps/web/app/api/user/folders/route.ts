import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getOutlookFolderTree } from "@/utils/outlook/folders";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { getOutlookClientForEmail } from "@/utils/account";
import { isMicrosoftProvider } from "@/utils/email/provider-types";

export type GetFoldersResponse = Awaited<ReturnType<typeof getFolders>>;

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;

  const result = await getFolders({ emailAccountId });
  return NextResponse.json(result);
});

async function getFolders({ emailAccountId }: { emailAccountId: string }) {
  const emailAccount = await getEmailAccountWithAiAndTokens({ emailAccountId });

  if (isMicrosoftProvider(emailAccount?.account?.provider)) {
    const outlook = await getOutlookClientForEmail({ emailAccountId });
    return getOutlookFolderTree(outlook);
  }

  return [];
}
