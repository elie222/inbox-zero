import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getBulkArchiveProgress } from "@/utils/redis/bulk-archive-progress";

export type BulkArchiveProgress = Awaited<
  ReturnType<typeof getArchiveProgress>
>;

async function getArchiveProgress({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  return getBulkArchiveProgress({ emailAccountId });
}

export const GET = withEmailAccount(
  "user/bulk-archive/progress",
  async (request) => {
    const emailAccountId = request.auth.emailAccountId;
    const result = await getArchiveProgress({ emailAccountId });
    return NextResponse.json(result);
  },
);
