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
    include: {
      digestSchedule: true,
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
  { allowAdmins: true },
);
