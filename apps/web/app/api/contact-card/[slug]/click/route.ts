import { NextResponse } from "next/server";
import { z } from "zod";
import { withError } from "@/utils/middleware";
import {
  CARD_CLICK_KINDS,
  recordContactCardClick,
} from "@/utils/contact-card/views";

const clickBody = z.object({ kind: z.enum(CARD_CLICK_KINDS) });

// Public: engagement beacons from the card page (phone/email/social taps).
// Fire-and-forget on the client — the response body is never read.
export const POST = withError(
  "contact-card-click",
  async (request, context) => {
    const { slug } = await context.params;

    const parsed = clickBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid" }, { status: 400 });
    }

    await recordContactCardClick({
      slug,
      kind: parsed.data.kind,
      headers: request.headers,
      logger: request.logger,
    });

    return NextResponse.json({ ok: true });
  },
);
