import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { env } from "@/env";
import { withError } from "@/utils/middleware";
import { isValidInternalApiKey } from "@/utils/internal-api";
import { handleDigestRequest } from "@/app/api/ai/digest/route";

export const POST = withError(
  "ai/digest/simple",
  async (request) => {
    if (env.QSTASH_TOKEN) {
      return NextResponse.json({
        error: "Qstash is set. This endpoint is disabled.",
      });
    }

    if (!isValidInternalApiKey(await headers(), request.logger)) {
      return NextResponse.json({ error: "Invalid API key" });
    }

    return handleDigestRequest(request);
  },
);
