import type { Coverage } from "@inboxzero/mail-core/queries";
import type { MailClient } from "@inboxzero/mail-core/engine";

export function isMetadataCoverageComplete(coverage: Coverage[]) {
  return (
    coverage.length > 0 &&
    coverage.every((item) => item.metadata === "complete")
  );
}

export async function waitForMetadataCoverage(
  client: MailClient,
  accountId: string,
  abort: AbortSignal,
) {
  while (!abort.aborted) {
    try {
      const diagnostics = await client.getDiagnostics(accountId);
      if (isMetadataCoverageComplete(diagnostics.coverage)) return true;
    } catch {
      // Coverage is observed; transient owner/follower errors keep waiting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}
