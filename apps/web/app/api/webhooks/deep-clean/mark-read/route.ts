import { NextResponse } from "next/server";
import { validateUserAndAiAccess } from "@/utils/user/validate";
import { createScopedLogger } from "@/utils/logger";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import prisma from "@/utils/prisma";
import {
  createBulkOperation,
  updateBulkOperationProgress,
} from "@/utils/redis/bulk-operation-progress";

const logger = createScopedLogger("api/webhooks/deep-clean/mark-read");

/**
 * Webhook handler called by QStash to process mark-as-read operations.
 * This is NOT a user-facing mutation - users call markCategoryAsReadAction which queues this job.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { emailAccountId, operationId, category, senders } = body;

    if (!emailAccountId || !operationId || !category || !senders) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    logger.info("Starting mark-as-read operation", {
      emailAccountId,
      operationId,
      category,
      senderCount: senders.length,
    });

    // Validate user access
    await validateUserAndAiAccess({ emailAccountId });

    // Get email account details
    const emailAccountWithAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        email: true,
        account: {
          select: {
            provider: true,
          },
        },
      },
    });

    const account = emailAccountWithAccount?.account;
    const ownerEmail = emailAccountWithAccount?.email;
    if (!account) throw new SafeError("No account found");
    if (!ownerEmail) throw new SafeError("No email found");

    // Create email provider (works for both Gmail and Outlook)
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider: account.provider,
    });

    // Get all thread IDs for these senders
    const allThreadIds: string[] = [];
    for (const sender of senders) {
      try {
        const threads = await emailProvider.getThreadsFromSenderWithSubject(
          sender,
          1000,
        );
        allThreadIds.push(...threads.map((t) => t.id));
      } catch (error) {
        logger.warn("Failed to get threads for sender", {
          sender,
          error,
        });
        // Continue with other senders even if one fails
      }
    }

    if (allThreadIds.length === 0) {
      logger.info("No threads found to mark as read", {
        emailAccountId,
        operationId,
      });
      return NextResponse.json({
        ok: true,
        message: "No threads found to mark as read",
        operationId,
      });
    }

    // Create progress tracker
    await createBulkOperation({
      emailAccountId,
      operationId,
      operationType: "mark-read",
      categoryOrSender: category,
      totalItems: allThreadIds.length,
    });

    // Update status to processing
    await updateBulkOperationProgress({
      emailAccountId,
      operationId,
      status: "processing",
    });

    let successCount = 0;
    let errorCount = 0;

    // Process threads in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < allThreadIds.length; i += BATCH_SIZE) {
      const batch = allThreadIds.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (threadId) => {
          try {
            await emailProvider.markReadThread(threadId, true);
            successCount++;

            // Update progress every 10 threads
            if (successCount % 10 === 0) {
              await updateBulkOperationProgress({
                emailAccountId,
                operationId,
                incrementCompleted: 10,
              });
            }
          } catch (error) {
            errorCount++;
            logger.warn("Failed to mark thread as read", {
              threadId,
              error,
            });
          }
        }),
      );

      logger.info("Batch marked as read", {
        operationId,
        batchNumber: Math.floor(i / BATCH_SIZE) + 1,
        totalBatches: Math.ceil(allThreadIds.length / BATCH_SIZE),
        successCount,
        errorCount,
      });
    }

    // Final progress update
    await updateBulkOperationProgress({
      emailAccountId,
      operationId,
      incrementCompleted: successCount % 10, // Update any remaining
      incrementFailed: errorCount,
      status: "completed",
    });

    logger.info("Mark-as-read operation completed", {
      emailAccountId,
      operationId,
      totalThreads: allThreadIds.length,
      successCount,
      errorCount,
    });

    return NextResponse.json({
      ok: true,
      message: `Marked ${successCount} emails as read${errorCount > 0 ? ` (${errorCount} failed)` : ""}`,
      operationId,
      successCount,
      errorCount,
    });
  } catch (error) {
    logger.error("Mark-as-read operation error", { error });

    if (error instanceof SafeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
