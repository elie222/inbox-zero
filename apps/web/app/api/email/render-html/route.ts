import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/utils/middleware";
import { rewriteHtmlForImageProxy } from "@/utils/email/image-proxy.server";

const renderHtmlBody = z.object({
  html: z.string(),
});

export const maxDuration = 15;

export const POST = withAuth("email/render-html", async (request) => {
  const body = renderHtmlBody.parse(await request.json());

  const html = await rewriteHtmlForImageProxy(body.html, request.logger);

  return NextResponse.json({ html });
});
