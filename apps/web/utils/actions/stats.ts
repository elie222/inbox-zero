import { actionClient } from "@/utils/actions/safe-action";
import { z } from "zod";
import { loadEmails } from "@/app/api/user/stats/load/load-emails";
import { getGmailAndAccessTokenForEmail } from "@/utils/account";

export const loadEmailStatsAction = actionClient
  .metadata({ name: "loadEmailStats" })
  .schema(z.object({ loadBefore: z.boolean() }))
  .action(async ({ parsedInput: { loadBefore }, ctx: { emailAccountId } }) => {
    const { gmail, accessToken } = await getGmailAndAccessTokenForEmail({
      emailAccountId,
    });

    if (!accessToken) return { error: "Missing access token" };

    await loadEmails(
      {
        emailAccountId,
        gmail,
        accessToken,
      },
      {
        loadBefore,
      },
    );
  });
