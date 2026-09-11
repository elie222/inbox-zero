import { env } from "@/env";
import { getLlmsTxt } from "@/utils/agent-markdown/content";
import { BRAND_NAME, SUPPORT_EMAIL } from "@/utils/branding";

export function GET() {
  const body = getLlmsTxt(env.NEXT_PUBLIC_BASE_URL, {
    brandName: BRAND_NAME,
    supportEmail: SUPPORT_EMAIL,
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  });
}
