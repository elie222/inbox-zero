import { NextResponse } from "next/server";
import { isAuthorizedCronOrInternalRequest } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { withError } from "@/utils/middleware";
import { cleanupConfiguredAIDraftsForAccount } from "@/utils/ai/draft-cleanup";
import { draftCleanupAccountBody } from "./validation";

export const maxDuration = 300;

export const POST = withError("cron/draft-cleanup/account", async (request) => {
  if (!isAuthorizedCronOrInternalRequest(request)) {
    captureException(
      new Error("Unauthorized request: api/cron/draft-cleanup/account"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  const { emailAccountId } = draftCleanupAccountBody.parse(
    await request.json(),
  );
  const logger = request.logger.with({ emailAccountId });

  const result = await cleanupConfiguredAIDraftsForAccount({
    emailAccountId,
    logger,
  });

  return NextResponse.json(result);
});
