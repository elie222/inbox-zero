import { NextResponse } from "next/server";
import { z } from "zod";
import { withError } from "@/utils/middleware";
import { getPublicAvailability } from "@/utils/booking/public";

export type GetPublicBookingAvailabilityResponse = Awaited<
  ReturnType<typeof getData>
>;

const availabilityQuerySchema = z.object({
  eventTypeSlug: z.string().min(1),
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export const GET = withError(
  "public/booking-link-availability",
  async (request, context) => {
    const { slug } = await context.params;
    const searchParams = request.nextUrl.searchParams;
    const query = availabilityQuerySchema.parse({
      eventTypeSlug: searchParams.get("eventTypeSlug"),
      start: searchParams.get("start"),
      end: searchParams.get("end"),
    });
    const result = await getData({
      slug,
      eventTypeSlug: query.eventTypeSlug,
      start: new Date(query.start),
      end: new Date(query.end),
      logger: request.logger,
    });

    return NextResponse.json(result);
  },
);

async function getData({
  slug,
  eventTypeSlug,
  start,
  end,
  logger,
}: {
  slug: string;
  eventTypeSlug: string;
  start: Date;
  end: Date;
  logger: Parameters<typeof getPublicAvailability>[0]["logger"];
}) {
  const slots = await getPublicAvailability({
    slug,
    eventTypeSlug,
    start,
    end,
    logger,
  });

  return { slots };
}
