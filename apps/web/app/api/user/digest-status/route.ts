import { NextResponse } from "next/server";
import { getDigestDeliveryState } from "@/utils/digest/delivery-state";
import { getEstimatedDigestDeliveryAt } from "@/utils/digest/schedule";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type GetDigestStatusResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount("user/digest-status", async (request) => {
  const result = await getData({
    emailAccountId: request.auth.emailAccountId,
  });

  return NextResponse.json(result);
});

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const [emailAccount, deliveryState] = await Promise.all([
    prisma.emailAccount.findUniqueOrThrow({
      where: { id: emailAccountId },
      select: {
        email: true,
        timezone: true,
        digestSendEmail: true,
        digestSchedule: {
          select: {
            id: true,
            intervalDays: true,
            occurrences: true,
            daysOfWeek: true,
            timeOfDay: true,
            lastOccurrenceAt: true,
            nextOccurrenceAt: true,
          },
        },
      },
    }),
    getDigestDeliveryState({ emailAccountId }),
  ]);

  return {
    schedule: emailAccount.digestSchedule,
    delivery: {
      emailEnabled: emailAccount.digestSendEmail,
      destinationEmail: emailAccount.email,
      timezone: emailAccount.timezone,
      estimatedNextDeliveryAt: getEstimatedDigestDeliveryAt(
        emailAccount.digestSchedule?.nextOccurrenceAt,
      ),
      ...deliveryState,
    },
  };
}
