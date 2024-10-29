import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { getSessionAndGmailClient } from "@/utils/actions/helpers";
import { getSenders } from "@inboxzero/tinybird";
import prisma from "@/utils/prisma";

export type UncategorizedSendersResponse = Awaited<
  ReturnType<typeof getUncategorizedSenders>
>;

async function getUncategorizedSenders({
  email,
  userId,
}: {
  email: string;
  userId: string;
}) {
  let uncategorizedSenders: string[] = [];
  let offset = 0;
  const limit = 200;

  while (uncategorizedSenders.length === 0) {
    const result = await getSenders({ ownerEmail: email, limit, offset });
    const allSenders = result.data.map((sender) => sender.from);

    const existingSenders = await prisma.newsletter.findMany({
      where: {
        email: { in: allSenders },
        userId,
      },
      select: { email: true },
    });

    const existingSenderEmails = new Set(existingSenders.map((s) => s.email));

    uncategorizedSenders = allSenders.filter(
      (email) => !existingSenderEmails.has(email),
    );

    // Break the loop if no more senders are available
    if (allSenders.length < limit) break;

    offset += limit;
  }

  return { uncategorizedSenders };
}

export const GET = withError(async () => {
  const { gmail, user, error, session } = await getSessionAndGmailClient();
  if (!user?.email) return NextResponse.json({ error: "Not authenticated" });
  if (error) return NextResponse.json({ error });
  if (!gmail) return NextResponse.json({ error: "Could not load Gmail" });
  if (!session?.accessToken)
    return NextResponse.json({ error: "No access token" });

  const result = await getUncategorizedSenders({
    email: user.email,
    userId: user.id,
  });

  return NextResponse.json(result);
});
