import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailProvider } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import { getEmailAccountWithAi } from "@/utils/user/get";
import {
  extractEmailAddress,
  extractNameFromEmail,
  isSameEmailAddress,
  participant,
} from "@/utils/email";
import { getPublicContactContext } from "@/utils/ai/public-contact-context";
import type { EmailProvider } from "@/utils/email/types";

const paramsSchema = z.object({ messageId: z.string().min(1).max(512) });

export type GetPublicContactContextResponse = Awaited<
  ReturnType<typeof getData>
>;

export const maxDuration = 60;

export const GET = withEmailProvider(
  "user/public-contact-context",
  async (request, context) => {
    const { messageId } = paramsSchema.parse(await context.params);
    const result = await getData({
      emailAccountId: request.auth.emailAccountId,
      userEmail: request.auth.email,
      messageId,
      emailProvider: request.emailProvider,
    });

    return NextResponse.json(result);
  },
);

async function getData({
  emailAccountId,
  userEmail,
  messageId,
  emailProvider,
}: {
  emailAccountId: string;
  userEmail: string;
  messageId: string;
  emailProvider: EmailProvider;
}) {
  const [emailAccount, message] = await Promise.all([
    getEmailAccountWithAi({ emailAccountId }),
    emailProvider.getMessage(messageId),
  ]);
  if (!emailAccount) throw new SafeError("Email account not found");

  const sender = participant(message, userEmail);
  const email = extractEmailAddress(sender);
  const name = extractNameFromEmail(sender);
  if (!email || isSameEmailAddress(email, userEmail)) {
    return { status: "unavailable", reason: "not_found" } as const;
  }

  return getPublicContactContext({
    email,
    name: name === email ? undefined : name,
    emailAccount,
  });
}
