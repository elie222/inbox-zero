import { after } from "next/server";
import {
  isSameOriginSentMessageOpenRequest,
  isSentMessageOpenToken,
} from "@/utils/email/sent-message-open";
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

export async function GET(
  request: Request,
  context: { params: Promise<{ token?: string }> },
) {
  try {
    const { token } = await context.params;
    if (
      typeof token === "string" &&
      isSentMessageOpenToken(token) &&
      !isSameOriginSentMessageOpenRequest({
        requestUrl: request.url,
        referer: request.headers.get("referer"),
      })
    ) {
      after(() => recordSentMessageOpen(token));
    }
  } catch {
    // Always return the pixel so the response does not reveal whether a token exists.
  }

  if (request.method === "HEAD") {
    return new Response(null, { headers: PIXEL_HEADERS, status: 200 });
  }
  return new Response(TRANSPARENT_GIF, {
    headers: PIXEL_HEADERS,
    status: 200,
  });
}

export const HEAD = GET;
