import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";

export type UserResponse = Awaited<ReturnType<typeof getUser>>;

async function getUser(userId: string) {
  return await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      lemonSqueezyCustomerId: true,
      lemonSqueezySubscriptionId: true,
      lemonSqueezyRenewsAt: true,
      unsubscribeCredits: true,
      aiModel: true,
      openAIApiKey: true,
      statsEmailFrequency: true,
    },
  });
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const user = await getUser(session.user.id);

  return NextResponse.json(user);
});
