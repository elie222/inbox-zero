import { NextResponse } from "next/server";
import { recordContactCardView } from "@/utils/contact-card/views";
import { withError } from "@/utils/middleware";
import {
  checkRateLimit,
  createRateLimitKey,
  getClientIp,
} from "@/utils/rate-limit";

// Public, unauthenticated: the card page pings this once after it renders.
// Counting here rather than during render keeps Next's prefetching and
// metadata generation from inflating the number.
export const POST = withError("contact-card-view", async (request, context) => {
  const { slug } = await context.params;

  const limited = await checkRateLimit({
    rule: {
      key: createRateLimitKey([
        "contact-card-view",
        getClientIp(request.headers),
      ]),
      limit: 60,
      windowSeconds: 60,
    },
    logger: request.logger,
  });
  if (limited.limited) {
    return NextResponse.json({ counted: false }, { status: 429 });
  }

  const result = await recordContactCardView({
    slug,
    headers: request.headers,
    logger: request.logger,
  });

  return NextResponse.json(result);
});
