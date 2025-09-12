import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type GetCalendarsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;

  const result = await getData({ emailAccountId });
  return NextResponse.json(result);
});

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const connections = await prisma.calendarConnection.findMany({
    where: { emailAccountId },
    include: {
      calendars: {
        orderBy: { name: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return { connections };
}
