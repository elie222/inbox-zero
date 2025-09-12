import { sendInvitationEmail } from "@inboxzero/resend";
import { generateSecureToken } from "@/utils/api-key";
import { env } from "@/env";

export async function sendOrganizationInvitation({
  email,
  organizationName,
  inviterName,
  invitationId,
}: {
  email: string;
  organizationName: string;
  inviterName: string;
  invitationId: string;
}) {
  const unsubscribeToken = generateSecureToken();

  await sendInvitationEmail({
    from: env.RESEND_FROM_EMAIL,
    to: email,
    emailProps: {
      baseUrl: env.NEXT_PUBLIC_BASE_URL,
      organizationName,
      inviterName,
      invitationId,
      unsubscribeToken,
    },
  });
}
