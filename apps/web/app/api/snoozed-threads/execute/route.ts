import { z } from "zod";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { withQstashOrInternal } from "@/utils/qstash";
import { processSnoozedThread } from "@/utils/snooze/process-due";

export const maxDuration = 300;

const bodySchema = z.object({ snoozedThreadId: z.string().min(1) });

export const POST = withError(
  "snoozed-threads/execute",
  withQstashOrInternal(async (request) => {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return new Response("Invalid payload structure", { status: 400 });
    }

    const snoozedThread = await prisma.snoozedThread.findUnique({
      where: { id: parsed.data.snoozedThreadId },
      include: { emailAccount: { include: { account: true } } },
    });
    if (!snoozedThread) {
      return new Response("Snoozed thread not found", { status: 404 });
    }
    if (snoozedThread.status !== SnoozedThreadStatus.PENDING) {
      return new Response("Snoozed thread is not pending", { status: 200 });
    }

    const result = await processSnoozedThread(snoozedThread, request.logger);
    if (result.status === "skipped") {
      return new Response("Snoozed thread is already being processed", {
        status: 200,
      });
    }
    if (result.status === "failed") {
      return new Response(
        result.reason === "missing-provider"
          ? "Email account or provider missing"
          : "Failed to restore snoozed thread",
        { status: 500 },
      );
    }

    return new Response("Snoozed thread restored", { status: 200 });
  }),
);
