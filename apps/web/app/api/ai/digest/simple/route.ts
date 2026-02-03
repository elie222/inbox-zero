import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { withError } from "@/utils/middleware";
import { handleDigestRequest } from "@/app/api/ai/digest/handle-digest";
import { env } from "@/env";
import { isValidInternalApiKey } from "@/utils/internal-api";

export const maxDuration = 300;

// Fallback when Qstash is not in use
export const POST = withError("ai/digest/simple", async (request) => {
  if (env.QSTASH_TOKEN) {
    return NextResponse.json({
      error: "Qstash is set. This endpoint is disabled.",
    });
  }

  if (!isValidInternalApiKey(await headers(), request.logger))
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  return handleDigestRequest(request);
});
