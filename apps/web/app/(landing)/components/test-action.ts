"use server";

import { createScopedLogger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";

const logger = createScopedLogger("testAction");

export async function testAction() {
  logger.info("testAction started");

  // sleep for 5 seconds
  await sleep(5000);

  logger.info("testAction completed");

  return "Action completed";
}
