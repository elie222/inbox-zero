import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { env } from "@/env";
import { withError } from "@/utils/middleware";
import { isValidInternalApiKey } from "@/utils/internal-api";
import { handleCleanGmailRequest } from "@/app/api/clean/gmail/route";

export const POST = withError(
  "clean/gmail/simple",
  async (request) => {
    if (env.QSTASH_TOKEN) {
      return NextResponse.json({
        error: "Qstash is set. This endpoint is disabled.",
      });
    }

    if (!isValidInternalApiKey(await headers(), request.logger)) {
      return NextResponse.json({ error: "Invalid API key" });
    }

    return handleCleanGmailRequest(request);
  },
);
