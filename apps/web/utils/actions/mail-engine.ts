"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { mailEngineStartupFailureBody } from "@/utils/actions/mail-engine.validation";

export const reportMailEngineStartupFailureAction = actionClient
  .metadata({ name: "reportMailEngineStartupFailure" })
  .inputSchema(mailEngineStartupFailureBody)
  .action(async ({ ctx: { logger }, parsedInput }) => {
    logger.error("Browser mail engine startup failed", parsedInput);
  });
