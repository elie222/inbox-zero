import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type NewsletterSummaryResponse = Awaited<
  ReturnType<typeof getNewsletterSummary>
>;

async function getNewsletterSummary({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const result = await prisma.newsletter.groupBy({
    where: { emailAccountId },
    by: ["status"],
    _count: true,
  });

  const resultObject = Object.fromEntries(
    result.map((item) => [item.status, item._count]),
  );

  return { result: resultObject };
}

export const GET = withEmailAccount(
  async (request) => {
    const emailAccountId = request.auth.emailAccountId;

    const result = await getNewsletterSummary({ emailAccountId });

    return NextResponse.json(result);
  },
  { allowOrgAdmins: true },
);
