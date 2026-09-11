import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";

export type GetAvailabilityResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount("user/availability", async (request) => {
  const { emailAccountId } = request.auth;

  const result = await getData({ emailAccountId });
  return NextResponse.json(result);
});

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const [emailAccount, schedule] = await Promise.all([
    prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { timezone: true },
    }),
    prisma.availabilitySchedule.findFirst({
      where: { emailAccountId, isDefault: true },
      orderBy: { createdAt: "asc" },
      select: {
        timezone: true,
        windows: {
          orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }],
          select: {
            id: true,
            weekday: true,
            startMinutes: true,
            endMinutes: true,
          },
        },
      },
    }),
  ]);

  if (!emailAccount) throw new SafeError("User not found", 404);

  return { timezone: emailAccount.timezone, schedule };
}
