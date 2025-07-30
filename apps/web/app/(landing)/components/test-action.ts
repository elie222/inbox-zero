"use server";

import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("testAction");

export async function testAction() {
  logger.info("testAction started");

  // sleep for 5 seconds
  await new Promise((resolve) => setTimeout(resolve, 5000));

  logger.info("testAction completed");

  return "Action completed";
}
