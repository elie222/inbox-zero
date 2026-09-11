import { NextResponse } from "next/server";
import { assertCleanerApiEnabled } from "@/utils/cleaner-feature";
import { withError, type RequestWithLogger } from "@/utils/middleware";
import { withQstashOrInternal } from "@/utils/qstash";
import { cleanThread, cleanThreadBody } from "./controller";

export const POST = withError(
  withQstashOrInternal(async (request: RequestWithLogger) => {
    assertCleanerApiEnabled();

    const json = await request.json();
    const body = cleanThreadBody.parse(json);

    await cleanThread({
      ...body,
      logger: request.logger,
    });

    return NextResponse.json({ success: true });
  }),
);
