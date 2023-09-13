import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
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
    },
  });
}

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const user = await getUser(session.user.id);

  return NextResponse.json(user);
}
