import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getBulkArchiveSenderStatuses } from "@/utils/redis/bulk-archive-sender-status";

export type BulkArchiveSenderStatuses = Awaited<
  ReturnType<typeof getArchiveSenderStatuses>
>;

async function getArchiveSenderStatuses({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  return getBulkArchiveSenderStatuses(emailAccountId);
}

export const GET = withEmailAccount(
  "user/bulk-archive/sender-status",
  async (request) => {
    const result = await getArchiveSenderStatuses({
      emailAccountId: request.auth.emailAccountId,
    });
    return NextResponse.json(result);
  },
);
