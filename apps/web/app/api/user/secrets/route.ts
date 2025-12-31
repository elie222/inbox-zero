import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";

export type UserSecretsResponse = Awaited<ReturnType<typeof getSecrets>>;

async function getSecrets({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      aiApiKey: true,
      webhookSecret: true,
    },
  });

  return {
    aiApiKey: user?.aiApiKey ?? null,
    webhookSecret: user?.webhookSecret ?? null,
  };
}

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;
  const secrets = await getSecrets({ userId });
  return NextResponse.json(secrets);
});
