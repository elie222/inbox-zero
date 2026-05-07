import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { getPublicBookingLinkMetadata } from "@/utils/booking/public";

export type GetPublicBookingLinkResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withError(
  "public/booking-links",
  async (_request, context) => {
    const { slug } = await context.params;
    const result = await getData({ slug });

    return NextResponse.json(result);
  },
);

async function getData({ slug }: { slug: string }) {
  return getPublicBookingLinkMetadata(slug);
}
