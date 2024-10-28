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
  const result = await getSenders({ ownerEmail: email });
  const allSenders = result.data.map((sender) => sender.from);

  const existingSenders = await prisma.newsletter.findMany({
    where: {
      email: { in: allSenders },
      userId,
    },
    select: {
      email: true,
    },
  });

  // Create a Set of existing sender emails for faster lookup
  const existingSenderEmails = new Set(existingSenders.map((s) => s.email));

  // Filter out senders that already exist in the database
  const uncategorizedSenders = allSenders.filter(
    (email) => !existingSenderEmails.has(email),
  );

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
