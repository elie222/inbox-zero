import type { BulkRuleRun } from "@/generated/prisma/client";

export function isBulkRunTerminal(status: BulkRuleRun["status"]) {
  return status === "COMPLETED" || status === "STOPPED";
}

export function shouldShowBulkRunNotice(
  run: Pick<BulkRuleRun, "id" | "status"> & { total: number },
  dismissed: readonly string[],
) {
  if (!isBulkRunTerminal(run.status)) return true;
  return run.total > 0 && !dismissed.includes(run.id);
}
