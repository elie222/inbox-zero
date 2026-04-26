import { env } from "@/env";
import type { Logger } from "@/utils/logger";

export function shouldSkipAutoDraft({
  logger,
  source,
}: {
  logger: Pick<Logger, "info">;
  source: string;
}) {
  if (!env.NEXT_PUBLIC_AUTO_DRAFT_DISABLED) return false;

  logger.info("Skipping auto-draft because auto-drafting is disabled", {
    source,
  });
  return true;
}
