import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { listThunderbirdInboxItems } from "@/utils/redis/thunderbird-inbox";
import { isThunderbirdProvider } from "@/utils/email/provider-types";

export type GetThunderbirdReviewResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount(
  "user/thunderbird/review",
  async (request) => {
    const { emailAccountId } = request.auth;
    const result = await getData({ emailAccountId });
    if (!result) {
      return NextResponse.json(
        { error: "Not a Thunderbird account" },
        { status: 400 },
      );
    }
    return NextResponse.json(result);
  },
);

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { account: { select: { provider: true } } },
  });
  if (!emailAccount || !isThunderbirdProvider(emailAccount.account.provider)) {
    return null;
  }

  const items = await listThunderbirdInboxItems(emailAccountId);
  return { items };
}
