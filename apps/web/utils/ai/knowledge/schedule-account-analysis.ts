import "server-only";
import { after } from "next/server";
import { redis } from "@/utils/redis";
import {
  acquireOwnedLock,
  clearOwnedLock,
  markOwnedLockProcessed,
} from "@/utils/redis/owned-lock";
import type { Logger } from "@/utils/logger";
import { flushLoggerSafely } from "@/utils/logger-flush";

type AnalysisKind = "persona" | "behavior" | "writing-style";

export async function scheduleAccountAnalysis({
  emailAccountId,
  kind,
  logger,
  run,
}: {
  emailAccountId: string;
  kind: AnalysisKind;
  logger: Logger;
  run: (ownsLock: () => Promise<boolean>) => Promise<boolean>;
}) {
  const key = getAnalysisKey(emailAccountId, kind);
  const lockToken = await acquireOwnedLock({ key, processingTtlSeconds: 300 });
  if (!lockToken)
    return { status: await getAccountAnalysisStatus(emailAccountId, kind) };

  try {
    // Provider reads must not hold Next.js's per-client Server Action queue.
    after(async () => {
      let status = "cooldown";
      try {
        const completed = await run(
          async () => (await redis.get(key)) === lockToken,
        );
        if (completed) status = "completed";
      } catch (error) {
        logger.warn("Background account analysis did not complete", {
          kind,
          error,
        });
      } finally {
        await markOwnedLockProcessed({
          key,
          lockToken,
          processedStatus: status,
          processedTtlSeconds: 60,
        });
        await flushLoggerSafely(logger, {
          action: kind,
          flushReason: "background-analysis",
        });
      }
    });
  } catch (error) {
    await clearOwnedLock({ key, lockToken });
    throw error;
  }
  return { status: "running" as const };
}

export async function getAccountAnalysisStatus(
  emailAccountId: string,
  kind: AnalysisKind,
): Promise<"idle" | "running" | "cooldown" | "completed"> {
  const value = await redis.get<string>(getAnalysisKey(emailAccountId, kind));
  if (!value) return "idle";
  if (value === "cooldown" || value === "completed") return value;
  return "running";
}

function getAnalysisKey(emailAccountId: string, kind: AnalysisKind) {
  return `${kind}-analysis:${emailAccountId}`;
}
