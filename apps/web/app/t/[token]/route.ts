import { after } from "next/server";
import { withError } from "@/utils/middleware";
import { isSentMessageOpenToken } from "@/utils/email/sent-message-open";
import { recordSentMessageOpen } from "@/utils/email/sent-message-open.server";

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const PIXEL_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  "Content-Type": "image/gif",
  Expires: "0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

export const dynamic = "force-dynamic";

export const GET = withError(
  "sent-message-open",
  async (request, { params }) => {
    const { token } = await params;
    if (typeof token === "string" && isSentMessageOpenToken(token)) {
      after(() => recordSentMessageOpen(token));
    }
    if (request.method === "HEAD") {
      return new Response(null, { headers: PIXEL_HEADERS, status: 200 });
    }
    return new Response(TRANSPARENT_GIF, {
      headers: PIXEL_HEADERS,
      status: 200,
    });
  },
);

export const HEAD = GET;
