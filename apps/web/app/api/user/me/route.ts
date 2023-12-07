import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";

export type UserResponse = Awaited<ReturnType<typeof getUser>>;

async function getUser(userId: string) {
  return await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      lemonSqueezyCustomerId: true,
      lemonSqueezySubscriptionId: true,
      lemonSqueezyRenewsAt: true,
      aiModel: true,
      openAIApiKey: true,
      statsEmailFrequency: true,
    },
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const user = await getUser(session.user.id);

  return NextResponse.json(user);
}
