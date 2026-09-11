"use server";

import { createScopedLogger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";

const logger = createScopedLogger("testAction");

// server-action-export: allow - intentionally exposes a non-mutating test action.
export async function testAction() {
  logger.info("testAction started");

  await sleep(5000);

  logger.info("testAction completed");

  return "Action completed";
}
