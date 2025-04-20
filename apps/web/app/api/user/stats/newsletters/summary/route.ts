import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";

export type NewsletterSummaryResponse = Awaited<
  ReturnType<typeof getNewsletterSummary>
>;

async function getNewsletterSummary({
  emailAccountId,
}: { emailAccountId: string }) {
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

export const GET = withError(async () => {
  const session = await auth();
  const emailAccountId = session?.user.email;
  if (!emailAccountId) return NextResponse.json({ error: "Not authenticated" });

  const result = await getNewsletterSummary({ emailAccountId });

  return NextResponse.json(result);
});
