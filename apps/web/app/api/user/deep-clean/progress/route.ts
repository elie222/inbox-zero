import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import {
  getBulkOperationProgress,
  getAllBulkOperations,
} from "@/utils/redis/bulk-operation-progress";

const logger = createScopedLogger("api/user/deep-clean/progress");

export type BulkOperationProgress = Awaited<
  ReturnType<typeof getBulkOperationProgressInternal>
>;

async function getBulkOperationProgressInternal({
  emailAccountId,
  operationId,
}: {
  emailAccountId: string;
  operationId?: string;
}) {
  // If operationId is provided, get specific operation
  if (operationId) {
    const progress = await getBulkOperationProgress({
      emailAccountId,
      operationId,
    });

    return progress ? [{ ...progress, operationId }] : [];
  }

  // Otherwise, get all operations for this user
  return await getAllBulkOperations({ emailAccountId });
}

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;
  const { searchParams } = new URL(request.url);
  const operationId = searchParams.get("operationId") || undefined;

  const operations = await getBulkOperationProgressInternal({
    emailAccountId,
    operationId,
  });

  logger.info("Fetched bulk operation progress", {
    emailAccountId,
    operationId,
    operationCount: operations.length,
  });

  return NextResponse.json({
    operations,
  });
});
