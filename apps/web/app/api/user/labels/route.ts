import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";

export type UserLabelsResponse = Awaited<ReturnType<typeof getLabels>>;

async function getLabels(options: { emailAccountId: string }) {
  return await prisma.label.findMany({
    where: { emailAccountId: options.emailAccountId },
  });
}

export const GET = withError(async () => {
  const session = await auth();
  const emailAccountId = session?.user.email;
  if (!emailAccountId) return NextResponse.json({ error: "Not authenticated" });

  const labels = await getLabels({ emailAccountId });

  return NextResponse.json(labels);
});
