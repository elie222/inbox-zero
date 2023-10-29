import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";

export type UserLabelsResponse = Awaited<ReturnType<typeof getLabels>>;

async function getLabels(options: { userId: string }) {
  return await prisma.label.findMany({
    where: {
      userId: options.userId,
    },
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const labels = await getLabels({ userId: session.user.id });

  return NextResponse.json(labels);
}
