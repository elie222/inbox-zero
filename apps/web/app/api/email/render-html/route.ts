import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { rewriteHtmlForImageProxy } from "@/utils/email/image-proxy.server";
import { renderHtmlBody } from "@/utils/actions/render-html.validation";

export const maxDuration = 15;

export const POST = withAuth("email/render-html", async (request) => {
  const body = renderHtmlBody.parse(await request.json());

  const html = await rewriteHtmlForImageProxy(body.html, request.logger);

  return NextResponse.json({ html });
});
