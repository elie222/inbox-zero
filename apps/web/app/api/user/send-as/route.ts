import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";
import { withEmailProvider } from "@/utils/middleware";

export type GetSendAsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailProvider("user/send-as", async (request) => {
  const { emailAccountId, email } = request.auth;
  const result = await getData({
    emailAccountId,
    accountEmail: email,
    emailProvider: request.emailProvider,
  });
  return NextResponse.json(result);
});

async function getData({
  emailAccountId,
  accountEmail,
  emailProvider,
}: {
  emailAccountId: string;
  accountEmail: string;
  emailProvider: EmailProvider;
}) {
  const [addresses, emailAccount] = await Promise.all([
    emailProvider.getSendAsAddresses(),
    prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { name: true },
    }),
  ]);

  // Gmail leaves the account address unnamed when it uses the profile name.
  return {
    addresses: addresses.map((address) => ({
      ...address,
      name:
        address.name ||
        (address.email.toLowerCase() === accountEmail.toLowerCase()
          ? emailAccount?.name || undefined
          : undefined),
    })),
  };
}
