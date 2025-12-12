import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";

export type GetCalendarUpcomingEventsResponse = Awaited<
  ReturnType<typeof getData>
>;

export const GET = withEmailAccount(
  "user/calendar/upcoming-events",
  async (request) => {
    const { emailAccountId } = request.auth;

    const result = await getData({ emailAccountId });
    return NextResponse.json(result);
  },
);

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const providers = await createCalendarEventProviders(emailAccountId);

  const providerEvents = await Promise.all(
    providers.map(async (provider) => {
      return provider.fetchEvents({
        maxResults: 5,
      });
    }),
  );

  return {
    events: providerEvents.flat(),
  };
}
