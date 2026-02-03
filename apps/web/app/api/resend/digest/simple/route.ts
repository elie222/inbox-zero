import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { withError } from "@/utils/middleware";
import { handleDigestEmailRequest } from "@/app/api/resend/digest/handle-digest-email";
import { env } from "@/env";
import { isValidInternalApiKey } from "@/utils/internal-api";

export const maxDuration = 60;

// Fallback when Qstash is not in use
export const POST = withError("resend/digest/simple", async (request) => {
  if (env.QSTASH_TOKEN) {
    return NextResponse.json({
      error: "Qstash is set. This endpoint is disabled.",
    });
  }

  if (!isValidInternalApiKey(await headers(), request.logger))
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  return handleDigestEmailRequest(request);
});
