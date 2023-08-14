import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
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
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const labels = await getLabels({ userId: session.user.id });

  return NextResponse.json(labels);
}
