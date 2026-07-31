import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type CarddavExchangesResponse = Awaited<
  ReturnType<typeof getCarddavExchanges>
>;

export const GET = withEmailAccount("carddav-exchanges", async (request) => {
  const result = await getCarddavExchanges(request.auth.emailAccountId);
  return NextResponse.json(result);
});

// The last two days of CardDAV requests, newest first — the sync settings
// panel renders these so a stuck phone's conversation can be read in the app
async function getCarddavExchanges(emailAccountId: string) {
  const exchanges = await prisma.carddavExchange.findMany({
    where: { emailAccountId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      method: true,
      path: true,
      depth: true,
      status: true,
      responseBytes: true,
      userAgent: true,
      detail: true,
    },
  });

  return { exchanges };
}
