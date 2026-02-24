import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type RulesResponse = Awaited<ReturnType<typeof getRules>>;

async function getRules({ emailAccountId }: { emailAccountId: string }) {
  return await prisma.rule.findMany({
    where: { emailAccountId },
    include: {
      actions: true,
      group: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export const GET = withEmailAccount("user/rules", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const requestStartTime = Date.now();
  const slowRequestLogTimeout = setTimeout(() => {
    request.logger.warn("Rules request still running", {
      elapsedMs: Date.now() - requestStartTime,
    });
  }, 8000);

  try {
    const result = await getRules({ emailAccountId });
    const durationMs = Date.now() - requestStartTime;
    if (durationMs > 2000) {
      request.logger.warn("Rules request completed slowly", {
        durationMs,
        ruleCount: result.length,
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    request.logger.error("Error fetching rules", {
      error,
      durationMs: Date.now() - requestStartTime,
    });
    return NextResponse.json(
      { error: "Failed to fetch rules" },
      { status: 500 },
    );
  } finally {
    clearTimeout(slowRequestLogTimeout);
  }
});
