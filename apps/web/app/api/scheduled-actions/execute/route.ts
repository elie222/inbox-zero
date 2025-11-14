import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withError } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import { markQStashActionAsExecuting } from "@/utils/scheduled-actions/scheduler";
import { executeScheduledAction } from "@/utils/scheduled-actions/executor";
import prisma from "@/utils/prisma";
import { ScheduledActionStatus } from "@prisma/client";
import { createEmailProvider } from "@/utils/email/provider";

const logger = createScopedLogger("scheduled-actions-executor");

export const maxDuration = 300; // 5 minutes

const scheduledActionBody = z.object({
  scheduledActionId: z.string().min(1, "Scheduled action ID is required"),
});

export const POST = verifySignatureAppRouter(
  withError(async (request: NextRequest) => {
    try {
      logger.info("QStash request received", {
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
      });

      const rawPayload = await request.json();
      const validationResult = scheduledActionBody.safeParse(rawPayload);

      if (!validationResult.success) {
        logger.error("Invalid payload structure", {
          errors: validationResult.error.errors,
          receivedPayload: rawPayload,
        });
        return new Response("Invalid payload structure", { status: 400 });
      }

      const payload = validationResult.data;

      logger.info("Received QStash scheduled action execution request", {
        scheduledActionId: payload.scheduledActionId,
        payload,
      });

      const scheduledAction = await prisma.scheduledAction.findUnique({
        where: { id: payload.scheduledActionId },
        include: {
          emailAccount: {
            include: {
              account: true,
            },
          },
          executedRule: true,
        },
      });

      if (!scheduledAction) {
        logger.warn("Scheduled action not found", {
          scheduledActionId: payload.scheduledActionId,
        });
        return new Response("Scheduled action not found", { status: 404 });
      }

      // Check if action is still pending (might have been cancelled)
      if (scheduledAction.status === ScheduledActionStatus.CANCELLED) {
        logger.info("Scheduled action was cancelled, skipping execution", {
          scheduledActionId: payload.scheduledActionId,
        });
        return new Response("Action was cancelled", { status: 200 });
      }

      if (scheduledAction.status !== ScheduledActionStatus.PENDING) {
        logger.warn("Scheduled action is not in pending status", {
          scheduledActionId: payload.scheduledActionId,
          status: scheduledAction.status,
        });
        return new Response("Action is not pending", { status: 200 });
      }

      // Mark as executing to prevent duplicate processing
      const markedAction = await markQStashActionAsExecuting(
        scheduledAction.id,
      );
      if (!markedAction) {
        logger.warn("Action already being processed or completed", {
          scheduledActionId: scheduledAction.id,
        });
        return new Response("Action already being processed", { status: 200 });
      }

      const provider = await createEmailProvider({
        emailAccountId: scheduledAction.emailAccountId,
        provider: scheduledAction.emailAccount.account.provider,
        logger,
      });
      const executionResult = await executeScheduledAction(
        scheduledAction,
        provider,
        logger,
      );

      if (executionResult.success) {
        logger.info("Successfully executed QStash scheduled action", {
          scheduledActionId: scheduledAction.id,
          executedActionId: executionResult.executedActionId,
        });
        return new Response("Action executed successfully", { status: 200 });
      } else {
        logger.error("Failed to execute QStash scheduled action", {
          scheduledActionId: scheduledAction.id,
          error: executionResult.error,
        });
        return new Response("Action execution failed", { status: 500 });
      }
    } catch (error) {
      logger.error("QStash scheduled action execution failed", { error });
      return new Response("Internal server error", { status: 500 });
    }
  }),
);
