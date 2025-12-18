import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import type { Logger } from "@/utils/logger";

export type GetCalendarUpcomingEventsResponse = Awaited<
  ReturnType<typeof getData>
>;

export const GET = withEmailAccount(
  "user/calendar/upcoming-events",
  async (request) => {
    const { emailAccountId } = request.auth;

    const result = await getData({
      emailAccountId,
      logger: request.logger,
    });
    return NextResponse.json(result);
  },
);

async function getData({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
  const providers = await createCalendarEventProviders(emailAccountId, logger);

  const providerEvents = await Promise.all(
    providers.map(async (provider) => {
      return provider.fetchEvents({ maxResults: 3 });
    }),
  );

  return {
    events: providerEvents
      .flat()
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime()),
  };
}
