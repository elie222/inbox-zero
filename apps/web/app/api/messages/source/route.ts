import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailProvider } from "@/utils/middleware";

export const GET = withEmailProvider("messages/source", async (request) => {
  const messageId = z
    .string()
    .min(1)
    .parse(new URL(request.url).searchParams.get("messageId"));
  const source = await request.emailProvider.getMessageSource(messageId);
  return new NextResponse(new Uint8Array(source), {
    headers: {
      // The source holds untrusted html, so it must never render as a page.
      "Content-Type": "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
