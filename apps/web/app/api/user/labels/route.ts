import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type UserLabelsResponse = Awaited<ReturnType<typeof getLabels>>;

async function getLabels(options: { emailAccountId: string }) {
  return await prisma.label.findMany({
    where: { emailAccountId: options.emailAccountId },
  });
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const labels = await getLabels({ emailAccountId });

  return NextResponse.json(labels);
});
