"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { respondToCalendarInvitationBody } from "@/utils/actions/calendar-invitation.validation";
import { createEmailProvider } from "@/utils/email/provider";
import { respondToCalendarInvitation } from "@/utils/calendar/invitations/service";

export const respondToCalendarInvitationAction = actionClient
  .metadata({ name: "respondToCalendarInvitation" })
  .inputSchema(respondToCalendarInvitationBody)
  .action(
    async ({
      ctx: { emailAccountId, emailAccount, provider, logger },
      parsedInput: { messageId, response },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
      return respondToCalendarInvitation({
        emailAccountId,
        email: emailAccount.email,
        emailProvider,
        messageId,
        response,
        logger,
      });
    },
  );
