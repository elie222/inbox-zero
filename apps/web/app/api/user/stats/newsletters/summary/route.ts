import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";

export type NewsletterSummaryResponse = Awaited<
  ReturnType<typeof getNewsletterSummary>
>;

async function getNewsletterSummary({ email }: { email: string }) {
  const result = await prisma.newsletter.groupBy({
    where: { emailAccountId: email },
    by: ["status"],
    _count: true,
  });

  const resultObject = Object.fromEntries(
    result.map((item) => [item.status, item._count]),
  );

  return { result: resultObject };
}

export const GET = withAuth(async (request) => {
  const email = request.auth.userEmail;

  const result = await getNewsletterSummary({ email });

  return NextResponse.json(result);
});
