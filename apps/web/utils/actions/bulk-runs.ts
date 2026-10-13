"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  startBulkRunBody,
  controlBulkRunBody,
} from "@/utils/actions/bulk-runs.validation";
import prisma from "@/utils/prisma";
import { assertBulkRunAccess } from "@/utils/bulk-rules/access";
import { SafeError } from "@/utils/error";
import { isDuplicateError } from "@/utils/prisma-helpers";

export const startBulkRunAction = actionClient
  .metadata({ name: "startBulkRun" })
  .inputSchema(startBulkRunBody)
  .action(async ({ ctx: { emailAccountId, userId }, parsedInput }) => {
    const maxEmails = await assertBulkRunAccess(userId, parsedInput);
    try {
      const run = await prisma.bulkRuleRun.create({
        data: {
          ...parsedInput,
          emailAccountId,
          activeAccountId: emailAccountId,
          maxEmails,
        },
      });
      return { runId: run.id };
    } catch (error) {
      if (isDuplicateError(error))
        throw new SafeError(
          "This account already has a run. Open its progress to resume or stop it.",
        );
      throw error;
    }
  });

export const controlBulkRunAction = actionClient
  .metadata({ name: "controlBulkRun" })
  .inputSchema(controlBulkRunBody)
  .action(
    async ({
      ctx: { emailAccountId, userId },
      parsedInput: { runId, command },
    }) => {
      const run = await prisma.bulkRuleRun.findFirst({
        where: { id: runId, emailAccountId },
      });
      if (!run) throw new SafeError("Run not found");
      if (command === "resume") {
        await assertBulkRunAccess(userId, run);
        await prisma.bulkRuleRun.updateMany({
          where: { id: runId, emailAccountId, status: "PAUSED" },
          data: {
            status: run.scannedAt ? "RUNNING" : "QUEUED",
            error: null,
            retryAt: null,
            retryCount: 0,
          },
        });
      } else if (command === "pause") {
        await prisma.bulkRuleRun.updateMany({
          where: {
            id: runId,
            emailAccountId,
            status: { in: ["QUEUED", "SCANNING", "RUNNING"] },
          },
          data: { status: "PAUSED" },
        });
      } else {
        await prisma.bulkRuleRun.updateMany({
          where: { id: runId, emailAccountId, activeAccountId: emailAccountId },
          data: {
            status: "STOPPED",
            activeAccountId:
              run.leaseUntil && run.leaseUntil > new Date()
                ? emailAccountId
                : null,
          },
        });
      }
      return { runId };
    },
  );
