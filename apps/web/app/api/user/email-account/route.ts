import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { SafeError } from "@/utils/error";

export type EmailAccountFullResponse = Awaited<
  ReturnType<typeof getEmailAccount>
> | null;

async function getEmailAccount({ emailAccountId }: { emailAccountId: string }) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      digestSchedule: true,
      userId: true,
      about: true,
      multiRuleSelectionEnabled: true,
      signature: true,
      includeReferralSignature: true,
    },
  });

  if (!emailAccount) throw new SafeError("Email account not found");

  return emailAccount;
}

export const GET = withEmailAccount(
  async (request) => {
    const emailAccountId = request.auth.emailAccountId;

    const emailAccount = await getEmailAccount({ emailAccountId });

    return NextResponse.json(emailAccount);
  },
  { allowOrgAdmins: true },
);
